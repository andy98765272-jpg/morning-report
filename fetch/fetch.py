"""每日晨報資料抓取。每個區塊獨立執行，某一來源失敗不影響其他區塊；
失敗訊息會寫進 latest.json 的 errors，App 的「設定」頁看得到。"""
import datetime as dt
import io
import json
import math
import os
import re
import time
import traceback
import xml.etree.ElementTree as ET
from zoneinfo import ZoneInfo

import pandas as pd
import requests
import yfinance as yf

TPE = ZoneInfo("Asia/Taipei")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "data")
KDIR = os.path.join(OUT, "k")
HDIR = os.path.join(OUT, "hist")
CFG = json.load(open(os.path.join(ROOT, "config.json"), encoding="utf-8"))
NOW = dt.datetime.now(TPE)
TODAY = NOW.date()

S = requests.Session()
S.headers["User-Agent"] = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)
ERRORS = []


def section(name, default=None):
    def deco(fn):
        def run(*a, **k):
            try:
                return fn(*a, **k)
            except Exception as e:  # noqa: BLE001
                ERRORS.append(f"{name}: {type(e).__name__}: {e}")
                traceback.print_exc()
                return default() if callable(default) else default
        return run
    return deco


# ---------- 共用工具 ----------
def num(x):
    if x is None:
        return None
    if isinstance(x, (int, float)):
        return None if (isinstance(x, float) and math.isnan(x)) else float(x)
    s = str(x).replace(",", "").replace("+", "").strip()
    s = re.sub(r"<[^>]+>", "", s)
    if s in ("", "-", "--", "---", "X", "除權息"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def roc_date(s):
    """'114年11月26日' / '114/11/26' / '1141126' → date"""
    s = str(s).strip()
    m = re.match(r"(\d{2,3})\D+(\d{1,2})\D+(\d{1,2})", s)
    if m:
        y, mo, d = map(int, m.groups())
    elif re.fullmatch(r"\d{7}", s):
        y, mo, d = int(s[:3]), int(s[3:5]), int(s[5:])
    else:
        return None
    return dt.date(y + 1911 if y < 1911 else y, mo, d)


def get_json(url, **kw):
    r = S.get(url, timeout=30, **kw)
    r.raise_for_status()
    return r.json()


def twse(url):
    """證交所 rwd API，有頻率限制：每次間隔 3 秒。"""
    time.sleep(3)
    j = get_json(url)
    if j.get("stat") not in (None, "OK"):
        return None
    return j


def table(j, key_hint=None):
    """把證交所回傳的 fields/data 轉成 list[dict]。新版格式資料在 tables[]。"""
    if j is None:
        return []
    if "fields" in j and "data" in j:
        return [dict(zip(j["fields"], row)) for row in j["data"]]
    for t in j.get("tables", []):
        if key_hint is None or key_hint in (t.get("title") or ""):
            if t.get("fields") and t.get("data"):
                return [dict(zip(t["fields"], row)) for row in t["data"]]
    return []


def col(row, *keys):
    for k in row:
        if all(x in k for x in keys):
            return row[k]
    return None


def save(path, obj):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))


def load(path, default):
    try:
        return json.load(open(path, encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return default


def fname(sym):
    return re.sub(r"[^A-Za-z0-9._-]", "_", sym)


def r2(x, n=2):
    return None if x is None else round(float(x), n)


# ---------- 行情（yfinance）----------
_hist_cache = {}


def daily(sym):
    if sym in _hist_cache:
        return _hist_cache[sym]
    df = yf.Ticker(sym).history(period="10y", interval="1d", auto_adjust=False)
    rows = []
    for idx, r in df.iterrows():
        if any(pd.isna(r[c]) for c in ("Open", "High", "Low", "Close")):
            continue
        rows.append([idx.strftime("%Y-%m-%d"), r2(r["Open"], 4), r2(r["High"], 4),
                     r2(r["Low"], 4), r2(r["Close"], 4), int(r["Volume"] or 0)])
    _hist_cache[sym] = rows
    return rows


def intraday(sym):
    df = yf.Ticker(sym).history(period="1d", interval="5m", auto_adjust=False)
    pts = []
    for idx, r in df.iterrows():
        if not pd.isna(r["Close"]):
            pts.append([idx.strftime("%H:%M"), r2(r["Close"], 4)])
    return pts


def summarize(rows, pts=None):
    """由日線算出：最新價、漲跌、量、均量、一年高低與報酬。"""
    if len(rows) < 2:
        return None
    last, prev = rows[-1], rows[-2]
    vols = [r[5] for r in rows]
    yr = [r for r in rows if r[0] >= (dt.date.fromisoformat(last[0]) - dt.timedelta(days=365)).isoformat()]
    hi = max(yr, key=lambda r: r[2])
    lo = min(yr, key=lambda r: r[3])
    c = last[4]
    return {
        "date": last[0], "price": c, "prev": prev[4],
        "chg": r2(c - prev[4], 4), "pct": r2((c / prev[4] - 1) * 100),
        "vol": vols[-1],
        "v5": int(sum(vols[-5:]) / min(5, len(vols))),
        "v10": int(sum(vols[-10:]) / min(10, len(vols))),
        "hi52": hi[2], "hi52d": hi[0], "lo52": lo[3], "lo52d": lo[0],
        "ret1y": r2((c / yr[0][4] - 1) * 100) if yr else None,
        "spark": downsample(pts, 40) if pts else [r[4] for r in rows[-20:]],
        "sparkPrev": prev[4] if pts else rows[-21][4] if len(rows) > 20 else rows[0][4],
    }


def downsample(pts, n):
    vals = [p[1] for p in pts]
    if len(vals) <= n:
        return vals
    step = len(vals) / n
    return [vals[int(i * step)] for i in range(n)] + [vals[-1]]


def quote(sym, name, extra=None):
    rows = daily(sym)
    try:
        pts = intraday(sym)
    except Exception:  # noqa: BLE001
        pts = []
    # 盤中資料若不是最後一個交易日（例如假日抓取）就不用
    sm = summarize(rows, pts)
    if sm is None:
        raise ValueError(f"{sym} 沒有日線資料")
    save(os.path.join(KDIR, fname(sym) + ".json"),
         {"sym": sym, "name": name, "daily": rows, "intraday": {"prev": sm["prev"], "pts": pts}})
    q = {"sym": sym, "name": name, **sm}
    if extra:
        q.update(extra)
    return q


def quotes(items):
    out = []
    for it in items:
        q = section(f"報價 {it['sym']}")(quote)(it["sym"], it["name"])
        if q:
            out.append(q)
    return out


# ---------- 美股 ----------
@section("美股", dict)
def us_block():
    idx = quotes(CFG["us_indices"])
    hot = quotes(CFG["us_hot"])
    for q in hot:
        q["value"] = q["price"] * q["vol"]
    hot.sort(key=lambda q: q["value"], reverse=True)
    hot = hot[: CFG.get("us_hot_show", 6)]
    fx = daily("TWD=X")[-1][4]
    adrs = []
    for a in CFG["adrs"]:
        q = section(f"ADR {a['sym']}")(quote)(a["sym"], a["name"])
        tw = section(f"ADR 台股 {a['tw']}")(lambda s: daily(s)[-1][4])(a["tw"])
        if q:
            if tw:
                conv = q["price"] * fx / a["ratio"]
                q["twConv"] = r2(conv)
                q["twClose"] = tw
                q["premium"] = r2((conv / tw - 1) * 100)
            adrs.append(q)
    return {"indices": idx, "hot": hot, "adrs": adrs, "usdtwd": fx}


# ---------- 台股：大盤、夜盤 ----------
@section("夜盤", lambda: None)
def tx_night():
    path = os.path.join(HDIR, "tx_night.json")
    hist = load(path, {})
    if len(hist) < 120:
        backfill_tx(hist)
    j = get_json("https://openapi.taifex.com.tw/v1/DailyMarketReportFut")
    for r in j:
        if str(col(r, "Contract") or "").strip() != "TX":
            continue
        sess = str(col(r, "TradingSession") or "")
        if "盤後" not in sess and "After" not in sess:
            continue
        month = str(col(r, "ContractMonth") or "")
        if "/" in month:
            continue
        d = roc_or_iso(col(r, "Date"))
        rec = [num(col(r, "Open")), num(col(r, "High")), num(col(r, "Low")),
               num(col(r, "Last")), int(num(col(r, "Volume")) or 0), month]
        if d and rec[3] and (d not in hist or month <= hist[d][5]):
            hist[d] = rec
    save(path, hist)
    return night_from_hist(hist)


def roc_or_iso(s):
    s = str(s or "").strip()
    if re.fullmatch(r"\d{8}", s):
        return f"{s[:4]}-{s[4:6]}-{s[6:]}"
    d = roc_date(s)
    if d:
        return d.isoformat()
    try:
        return dt.date.fromisoformat(s.replace("/", "-")).isoformat()
    except ValueError:
        return None


def backfill_tx(hist):
    """期交所每日行情 CSV，一次查一個月，補一年盤後資料。"""
    for m in range(12, -1, -1):
        end = TODAY - dt.timedelta(days=30 * m)
        start = end - dt.timedelta(days=30)
        try:
            time.sleep(2)
            r = S.post("https://www.taifex.com.tw/cht/3/futDataDown", data={
                "down_type": "1", "commodity_id": "TX",
                "queryStartDate": start.strftime("%Y/%m/%d"), "queryEndDate": end.strftime("%Y/%m/%d"),
            }, timeout=30)
            df = pd.read_csv(io.StringIO(r.content.decode("big5", errors="ignore")), index_col=False)
        except Exception as e:  # noqa: BLE001
            ERRORS.append(f"夜盤歷史補資料: {e}")
            return
        df.columns = [str(c).strip() for c in df.columns]
        for _, x in df.iterrows():
            month = str(x.get("到期月份(週別)", "")).strip()
            if "/" in month or "W" in month or "盤後" not in str(x.get("交易時段", "")):
                continue
            d = str(x.get("交易日期", "")).replace("/", "-")
            rec = [num(x.get("開盤價")), num(x.get("最高價")), num(x.get("最低價")),
                   num(x.get("收盤價")), int(num(x.get("成交量")) or 0), month]
            if rec[3] and (d not in hist or month <= hist[d][5]):
                hist[d] = rec


def night_from_hist(hist):
    rows = [[d, *v[:5]] for d, v in sorted(hist.items()) if v[3]]
    if len(rows) < 2:
        return None
    sm = summarize(rows)
    save(os.path.join(KDIR, "TX_NIGHT.json"),
         {"sym": "TX_NIGHT", "name": "台指期 夜盤", "daily": rows, "intraday": {"prev": sm["prev"], "pts": []}})
    return {"sym": "TX_NIGHT", "name": "台指期夜盤", "contract": hist[rows[-1][0]][5], **sm}


# ---------- 台股：三大法人買賣超（金額）----------
@section("三大法人買賣超", lambda: None)
def inst_flows():
    path = os.path.join(HDIR, "inst.json")
    hist = load(path, {})
    d = TODAY
    tries = 0
    need = 25 if len(hist) < 20 else 3
    while tries < need + 15 and need > 0:
        tries += 1
        key = d.isoformat()
        if d.weekday() < 5 and key not in hist:
            j = twse(f"https://www.twse.com.tw/rwd/zh/fund/BFI82U?type=day&dayDate={d:%Y%m%d}&response=json")
            rows = table(j)
            if rows:
                f = t = dl = 0.0
                for r in rows:
                    name = str(list(r.values())[0])
                    diff = num(col(r, "買賣差額")) or 0
                    if "合計" in name:
                        continue
                    if "外資" in name:
                        f += diff
                    elif "投信" in name:
                        t += diff
                    elif "自營商" in name:
                        dl += diff
                hist[key] = [round(f / 1e8, 2), round(t / 1e8, 2), round(dl / 1e8, 2)]
                need -= 1
        elif key in hist:
            need -= 1
        d -= dt.timedelta(days=1)
    hist = dict(sorted(hist.items())[-60:])
    save(path, hist)
    days = sorted(hist.items())[-20:]
    return {"dates": [k for k, _ in days], "foreign": [v[0] for _, v in days],
            "trust": [v[1] for _, v in days], "dealer": [v[2] for _, v in days]}


# ---------- 台股：期貨三大法人未平倉 ----------
@section("台指期未平倉", lambda: None)
def futures_oi():
    start = TODAY - dt.timedelta(days=40)
    r = S.post("https://www.taifex.com.tw/cht/3/futContractsDateDown", data={
        "queryStartDate": start.strftime("%Y/%m/%d"), "queryEndDate": TODAY.strftime("%Y/%m/%d"),
        "commodityId": "TXF",
    }, timeout=30)
    df = pd.read_csv(io.StringIO(r.content.decode("big5", errors="ignore")), index_col=False)
    df.columns = [str(c).strip() for c in df.columns]
    netcol = next(c for c in df.columns if "未平倉" in c and "淨額" in c and "口數" in c)
    by = {}
    for _, x in df.iterrows():
        d = str(x["日期"]).replace("/", "-")
        who = str(x["身份別"])
        k = 0 if "外資" in who else 1 if "投信" in who else 2 if "自營" in who else None
        if k is None:
            continue
        by.setdefault(d, [None, None, None])[k] = int(num(x[netcol]) or 0)
    days = sorted(by.items())[-20:]
    return {"dates": [k for k, _ in days], "foreign": [v[0] for _, v in days],
            "trust": [v[1] for _, v in days], "dealer": [v[2] for _, v in days]}


# ---------- 台股：投本比、外本比 ----------
@section("投本比外本比", lambda: None)
def ratios():
    days = CFG.get("ratio_days", 5)
    shares = {}
    for r in get_json("https://openapi.twse.com.tw/v1/opendata/t187ap03_L"):
        code = str(col(r, "公司代號") or "").strip()
        sh = num(col(r, "已發行普通股數"))
        if code and sh:
            shares[code] = sh
    acc, names, got, d = {}, {}, [], TODAY
    while len(got) < days and (TODAY - d).days < 20:
        if d.weekday() < 5:
            rows = table(twse(f"https://www.twse.com.tw/rwd/zh/fund/T86?date={d:%Y%m%d}&selectType=ALLBUT0999&response=json"))
            if rows:
                got.append(d.isoformat())
                for r in rows:
                    code = str(col(r, "證券代號")).strip()
                    names[code] = str(col(r, "證券名稱")).strip()
                    f = num(col(r, "外陸資買賣超股數")) or 0
                    t = num(col(r, "投信買賣超股數")) or 0
                    a = acc.setdefault(code, [0.0, 0.0])
                    a[0] += f
                    a[1] += t
        d -= dt.timedelta(days=1)
    def top(i):
        lst = [(c, v[i], v[i] / shares[c] * 100) for c, v in acc.items() if c in shares and v[i] > 0]
        lst.sort(key=lambda x: x[2], reverse=True)
        return lst[: CFG.get("ratio_top", 10)]
    out = {"days": got, "trust": [], "foreign": []}
    chips = {}
    for key, i in (("trust", 1), ("foreign", 0)):
        for code, net, ratio in top(i):
            sym = f"{code}.TW"
            q = section(f"排行個股 {sym}")(quote)(sym, names.get(code, code))
            item = {"code": code, "sym": sym, "name": names.get(code, code),
                    "lots": round(net / 1000), "ratio": r2(ratio, 3)}
            if q:
                item.update({"price": q["price"], "pct": q["pct"], "spark": q["spark"], "sparkPrev": q["sparkPrev"]})
            out[key].append(item)
    for code, v in acc.items():
        if code in shares and any(code == x["code"] for k in ("trust", "foreign") for x in out[k]):
            chips[f"{code}.TW"] = {"trust": round(v[1] / 1000), "foreign": round(v[0] / 1000),
                                   "trustRatio": r2(v[1] / shares[code] * 100, 3),
                                   "foreignRatio": r2(v[0] / shares[code] * 100, 3)}
    out["chips"] = chips
    return out


# ---------- 資訊：新聞 ----------
@section("新聞", list)
def news():
    out = []
    for f in CFG["news_feeds"]:
        try:
            r = S.get(f["url"], timeout=30)
            root = ET.fromstring(r.content)
        except Exception as e:  # noqa: BLE001
            ERRORS.append(f"新聞 {f['cat']}: {e}")
            continue
        n = 0
        for it in root.iter("item"):
            title = (it.findtext("title") or "").strip()
            link = (it.findtext("link") or "").strip()
            src = (it.findtext("source") or "").strip()
            pub = it.findtext("pubDate") or ""
            try:
                t = pd.Timestamp(pub).tz_convert(TPE)
            except Exception:  # noqa: BLE001
                t = None
            if t is not None and (NOW - t.to_pydatetime()).total_seconds() > 36 * 3600:
                continue
            if not src and " - " in title:
                title, src = title.rsplit(" - ", 1)
            out.append({"cat": f["cat"], "title": title, "link": link, "src": src or "Yahoo股市",
                        "time": t.strftime("%m/%d %H:%M") if t is not None else "", "ts": t.timestamp() if t is not None else 0})
            n += 1
            if n >= CFG.get("news_per_cat", 8):
                break
    out.sort(key=lambda x: x["ts"], reverse=True)
    return out


# ---------- 資訊：法說會（公開資訊觀測站）----------
@section("法說會", list)
def investor_conferences():
    out = []
    months = {(TODAY.year, TODAY.month)}
    later = TODAY + dt.timedelta(days=14)
    months.add((later.year, later.month))
    for y, m in sorted(months):
        for typek in ("sii", "otc"):
            time.sleep(2)
            r = S.post("https://mopsov.twse.com.tw/mops/web/ajax_t100sb02_1", data={
                "encodeURIComponent": "1", "step": "1", "firstin": "1", "off": "1",
                "TYPEK": typek, "year": str(y - 1911), "month": f"{m:02d}", "co_id": "",
            }, timeout=30)
            r.encoding = "utf-8"
            try:
                tables = pd.read_html(io.StringIO(r.text))
            except ValueError:
                continue
            for t in tables:
                cols = [" ".join(map(str, c)) if isinstance(c, tuple) else str(c) for c in t.columns]
                t.columns = cols
                c_code = next((c for c in cols if "公司代號" in c), None)
                c_date = next((c for c in cols if "日期" in c), None)
                if not c_code or not c_date:
                    continue
                c_name = next((c for c in cols if "公司名稱" in c), None)
                c_time = next((c for c in cols if "時間" in c), None)
                c_place = next((c for c in cols if "地點" in c), None)
                c_desc = next((c for c in cols if "擇要" in c or "訊息" in c), None)
                for _, x in t.iterrows():
                    d = roc_date(str(x[c_date]).split("至")[0])
                    if not d or d < TODAY or d > later:
                        continue
                    place = str(x[c_place]) if c_place else ""
                    out.append({"date": d.isoformat(), "code": str(x[c_code]).strip(),
                                "name": str(x[c_name]).strip() if c_name else "",
                                "time": str(x[c_time]).strip() if c_time else "",
                                "mode": "線上" if re.search(r"線上|視訊|網路|webcast", place, re.I) else "實體",
                                "topic": (str(x[c_desc]).strip() if c_desc else place)[:40]})
    seen, uniq = set(), []
    for c in sorted(out, key=lambda c: (c["date"], c["time"])):
        k = (c["date"], c["code"])
        if k not in seen:
            seen.add(k)
            uniq.append(c)
    return uniq[:30]


# ---------- 資訊：配息 ----------
_tw_close = None


def tw_close(code):
    global _tw_close
    if _tw_close is None:
        _tw_close = {}
        for r in get_json("https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"):
            _tw_close[str(col(r, "Code"))] = num(col(r, "ClosingPrice"))
        try:
            for r in get_json("https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes"):
                _tw_close[str(col(r, "SecuritiesCompanyCode"))] = num(col(r, "Close"))
        except Exception as e:  # noqa: BLE001
            ERRORS.append(f"上櫃收盤價: {e}")
    return _tw_close.get(code)


@section("台股配息", list)
def tw_dividends():
    rows = table(twse("https://www.twse.com.tw/rwd/zh/exRight/TWT48U?response=json"))
    out = []
    for r in rows:
        d = roc_date(col(r, "除權除息日期") or "")
        cash = num(col(r, "現金股利"))
        if not d or not cash or "息" not in str(col(r, "除權息") or ""):
            continue
        code = str(col(r, "股票代號")).strip()
        px = tw_close(code)
        out.append({"date": d.isoformat(), "code": code, "name": str(col(r, "名稱")).strip(),
                    "cash": cash, "yield": r2(cash / px * 100) if px else None})
    out.sort(key=lambda x: x["date"])
    return out[:40]


@section("美股配息", list)
def us_dividends():
    out = []
    for sym in CFG["us_dividend_watch"]:
        try:
            t = yf.Ticker(sym)
            cal = t.calendar or {}
            ex = cal.get("Ex-Dividend Date")
            pay = cal.get("Dividend Date")
            info = t.info
            amt = info.get("lastDividendValue")
            y = info.get("dividendYield")
            if y is not None and y < 1:  # 舊版回傳 0.004 這種小數
                y *= 100
            if ex:
                out.append({"date": str(ex)[:10], "code": sym, "name": info.get("shortName", sym),
                            "cash": r2(amt, 4), "yield": r2(y), "pay": str(pay)[:10] if pay else None})
        except Exception as e:  # noqa: BLE001
            ERRORS.append(f"美股配息 {sym}: {e}")
    cutoff = (TODAY - dt.timedelta(days=14)).isoformat()
    out = [x for x in out if x["date"] >= cutoff]
    out.sort(key=lambda x: x["date"])
    return out


# ---------- 資訊：分割 ----------
def ratio_text(a, b):
    """a 股變 b 股：b>a 為分割（1 拆 N），b<a 為反分割（N 合 1）。"""
    if not a or not b or a == b:
        return None
    r = b / a
    return f"1 拆 {r:g}" if r > 1 else f"{1 / r:g} 合 1"


def split_us():
    """那斯達克分割行事曆：全美股、含即將生效。"""
    r = S.get("https://api.nasdaq.com/api/calendar/splits",
              headers={"Accept": "application/json, text/plain, */*", "Origin": "https://www.nasdaq.com",
                       "Referer": "https://www.nasdaq.com/"}, timeout=30)
    r.raise_for_status()
    rows = ((r.json().get("data") or {}).get("rows")) or []
    if rows:
        print("那斯達克分割欄位:", list(rows[0].keys()))
    out = []
    for x in rows:
        nums = [float(n) for n in re.findall(r"\d+(?:\.\d+)?", str(x.get("ratio", "")))]
        # 那斯達克寫法為「新 : 舊」，例如 4 : 1 代表一拆四
        txt = ratio_text(nums[1], nums[0]) if len(nums) >= 2 else str(x.get("ratio", ""))
        d = x.get("executionDate") or x.get("payableDate") or ""
        try:
            d = dt.datetime.strptime(d, "%m/%d/%Y").date().isoformat()
        except ValueError:
            continue
        out.append({"date": d, "code": str(x.get("symbol", "")).strip(), "name": str(x.get("name", "")).strip(),
                    "ratio": txt, "market": "美股"})
    return out


def split_tw():
    """證交所變更面額（股票分割）與 ETF 分割公告。網址為推測，逐一嘗試。"""
    out, tried, ok = [], [], False
    for path in ("change/TWTB7U", "change/TWTB8U", "split/TWTCAU", "split/TWTCBU"):
        url = f"https://www.twse.com.tw/rwd/zh/{path}?response=json"
        try:
            rows = table(twse(url))
        except Exception as e:  # noqa: BLE001
            tried.append(f"{path}:{type(e).__name__}")
            continue
        ok = True
        if rows:
            print(f"證交所 {path} 欄位:", list(rows[0].keys()))
        for r in rows:
            code = str(col(r, "代號") or "").strip()
            name = str(col(r, "名稱") or "").strip()
            d = None
            for k in r:
                if "日" in k and ("恢復" in k or "生效" in k or "買賣" in k or "日期" in k):
                    d = roc_date(r[k])
                    if d:
                        break
            if not code or not d:
                continue
            before, after = num(col(r, "變更前")), num(col(r, "變更後"))
            txt = None
            if before and after:  # 面額 10 元 → 1 元 = 一拆十
                txt = ratio_text(after, before)
            if not txt:
                rt = col(r, "比率") or col(r, "比例")
                v = num(rt)
                if v and v != 1:
                    txt = ratio_text(1, v)
                elif rt:
                    txt = str(rt).strip()
            out.append({"date": d.isoformat(), "code": code, "name": name, "ratio": txt or "變更面額", "market": "台股"})
    if not ok:
        raise RuntimeError("證交所分割公告網址都無法使用：" + ", ".join(tried))
    return out


def split_watchlist():
    out = []
    since = pd.Timestamp(TODAY - dt.timedelta(days=365))
    for sym in CFG["split_watch"]:
        try:
            s = yf.Ticker(sym).splits
        except Exception as e:  # noqa: BLE001
            ERRORS.append(f"分割追蹤 {sym}: {e}")
            continue
        for idx, ratio in s.items():
            if idx.tz_localize(None) >= since and ratio and ratio != 1:
                out.append({"date": idx.strftime("%Y-%m-%d"), "code": sym, "name": "",
                            "ratio": ratio_text(1, ratio), "market": "台股" if sym.endswith(".TW") else "美股"})
    return out


@section("股票分割", list)
def splits():
    out = []
    for name, fn in (("美股分割行事曆", split_us), ("台股分割公告", split_tw), ("分割追蹤清單", split_watchlist)):
        try:
            out += fn()
        except Exception as e:  # noqa: BLE001
            ERRORS.append(f"{name}: {type(e).__name__}: {e}")
    lo, hi = (TODAY - dt.timedelta(days=30)).isoformat(), (TODAY + dt.timedelta(days=90)).isoformat()
    seen, res = set(), []
    for x in sorted(out, key=lambda x: x["date"]):
        k = (x["code"].replace(".TW", ""), x["date"])
        if k in seen or not (lo <= x["date"] <= hi):
            continue
        seen.add(k)
        x["upcoming"] = x["date"] >= TODAY.isoformat()
        res.append(x)
    # 即將生效的排前面（近到遠），再接已生效（新到舊）
    up = [x for x in res if x["upcoming"]]
    done = sorted((x for x in res if not x["upcoming"]), key=lambda x: x["date"], reverse=True)
    return up + done


# ---------- 資訊：申購抽籤 ----------
@section("申購抽籤", list)
def lottery():
    rows = table(twse("https://www.twse.com.tw/rwd/zh/announcement/publicForm?response=json"))
    out = []
    for r in rows:
        draw = roc_date(col(r, "抽籤日期") or "")
        if not draw or draw < TODAY - dt.timedelta(days=7):
            continue
        code = str(col(r, "證券代號")).strip()
        offer = num(col(r, "實際承銷價")) or num(col(r, "承銷價"))
        s1, s2 = roc_date(col(r, "申購開始日") or ""), roc_date(col(r, "申購結束日") or "")
        deliver = roc_date(col(r, "撥券日期") or "")
        px = tw_close(code)
        shares = num(col(r, "申購股數")) or 1000
        if s1 and TODAY < s1:
            st = "soon"
        elif s2 and TODAY <= s2:
            st = "open"
        else:
            st = "closed"
        out.append({"name": str(col(r, "證券名稱")).strip(), "code": code, "market": str(col(r, "發行市場") or ""),
                    "status": st, "offer": offer, "price": px, "shares": shares,
                    "gain": r2((px - offer) * shares, 0) if px and offer else None,
                    "gainPct": r2((px / offer - 1) * 100) if px and offer else None,
                    "rate": num(col(r, "中籤率")),
                    "start": s1.isoformat() if s1 else None, "end": s2.isoformat() if s2 else None,
                    "draw": draw.isoformat(), "deliver": deliver.isoformat() if deliver else None})
    out.sort(key=lambda x: (x["gainPct"] is None, -(x["gainPct"] or 0)))
    return out


# ---------- 主程式 ----------
def main():
    os.makedirs(KDIR, exist_ok=True)
    data = {"generated": NOW.isoformat(timespec="minutes")}
    data["us"] = us_block()
    data["tw"] = {
        "taiex": section("加權指數", lambda: None)(quote)("^TWII", "加權指數"),
        "night": tx_night(),
        "inst": inst_flows(),
        "oi": futures_oi(),
        "ratios": ratios(),
    }
    data["info"] = {
        "news": news(), "calls": investor_conferences(),
        "divTW": tw_dividends(), "divUS": us_dividends(),
        "splits": splits(), "lottery": lottery(),
    }
    t, n = data["tw"]["taiex"], data["tw"]["night"]
    if t and n:
        n["basis"] = r2(n["price"] - t["price"])
    data["errors"] = ERRORS
    save(os.path.join(OUT, "latest.json"), data)
    print(f"完成，{len(ERRORS)} 個區塊有錯誤")
    for e in ERRORS:
        print(" -", e)


if __name__ == "__main__":
    main()
