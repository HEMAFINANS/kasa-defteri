import React, { useState, useEffect, useMemo } from "react";
import { Plus, Trash2, Landmark, Wallet, Repeat, TrendingUp, ArrowLeft, ArrowRight, CreditCard, Store, AlertTriangle, CheckCircle2, LogOut, UserPlus, Lock } from "lucide-react";
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { storage } from "./storage.js";

const AY_ADI = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];
const KEY = "kasa-defteri-v3";
const uid = () => Math.random().toString(36).slice(2, 10);
const pad = (n) => String(n).padStart(2, "0");

function todayMK() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
function mkToIndex(mk) {
  const [y, m] = mk.split("-").map(Number);
  return y * 12 + (m - 1);
}
function indexToMk(idx) {
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  return `${y}-${pad(m)}`;
}
function addMonths(mk, n) {
  return indexToMk(mkToIndex(mk) + n);
}
function labelMk(mk) {
  const [y, m] = mk.split("-").map(Number);
  return `${AY_ADI[m - 1]} ${String(y).slice(2)}`;
}
function formatTL(n) {
  const v = Number(n) || 0;
  return v.toLocaleString("tr-TR", { maximumFractionDigits: 0 }) + " ₺";
}

const emptyData = () => ({
  banks: [],
  installments: [],
  recurring: [],
  incomes: [],
  creditCards: [],
  vendorDebts: [],
  users: [],
});

async function sha256Hex(message) {
  const enc = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randomSalt() {
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function KasaDefteri() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [viewStart, setViewStart] = useState(null);
  const [openForm, setOpenForm] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [authMode, setAuthMode] = useState("login"); // 'login' | 'setup' | 'addUser'
  const [authError, setAuthError] = useState("");
  const [loginSelectedId, setLoginSelectedId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");

  const [bankDraft, setBankDraft] = useState({ name: "", balance: "" });
  const [instDraft, setInstDraft] = useState({ name: "", monthly: "", start: todayMK(), months: "" });
  const [recDraft, setRecDraft] = useState({ name: "", amount: "", start: todayMK() });
  const [incDraft, setIncDraft] = useState({ name: "", amount: "", type: "recurring", start: todayMK(), end: "" });
  const [cardDraft, setCardDraft] = useState({ name: "", totalDebt: "", minPayment: "", start: todayMK() });
  const [vendorDraft, setVendorDraft] = useState({ vendorName: "", amount: "", vadeMonth: todayMK(), note: "" });

  useEffect(() => {
    (async () => {
      try {
        const res = await storage.get(KEY);
        setData(res ? JSON.parse(res.value) : emptyData());
      } catch (e) {
        setData(emptyData());
      } finally {
        setLoading(false);
        setViewStart(todayMK());
      }
    })();
  }, []);

  const persist = async (next) => {
    setData(next);
    try {
      await storage.set(KEY, JSON.stringify(next));
    } catch (e) {
      setError("Kaydedilemedi, bağlantını kontrol et.");
      setTimeout(() => setError(null), 3000);
    }
  };

  const createUser = async (name, password) => {
    if (!name.trim() || !password) return;
    if (data.users.some((u) => u.name.toLowerCase() === name.trim().toLowerCase())) {
      setAuthError("Bu isimde bir kullanıcı zaten var.");
      return;
    }
    const salt = randomSalt();
    const hash = await sha256Hex(password + salt);
    const newUser = { id: uid(), name: name.trim(), salt, hash };
    const next = { ...data, users: [...data.users, newUser] };
    await persist(next);
    setCurrentUser(newUser);
    setNewUserName("");
    setNewUserPassword("");
    setAuthError("");
    setAuthMode("login");
  };

  const attemptLogin = async () => {
    const user = data.users.find((u) => u.id === loginSelectedId);
    if (!user) {
      setAuthError("Bir kullanıcı seç.");
      return;
    }
    const hash = await sha256Hex(loginPassword + user.salt);
    if (hash === user.hash) {
      setCurrentUser(user);
      setLoginPassword("");
      setAuthError("");
    } else {
      setAuthError("Şifre yanlış.");
    }
  };

  const logout = () => {
    setCurrentUser(null);
    setLoginPassword("");
    setLoginSelectedId("");
    setAuthMode("login");
  };

  // ---- Forecast hooks (must run on every render, before any early return) ----
  const HORIZON = 60;
  const timelineStart = useMemo(() => {
    if (!data) return todayMK();
    const starts = [
      todayMK(),
      ...data.installments.map((i) => i.start),
      ...data.recurring.map((r) => r.start),
      ...data.incomes.map((i) => i.start),
      ...data.creditCards.map((c) => c.start),
      ...data.vendorDebts.map((v) => v.vadeMonth),
    ];
    return starts.reduce((min, mk) => (mkToIndex(mk) < mkToIndex(min) ? mk : min), todayMK());
  }, [data]);

  const forecast = useMemo(() => {
    if (!data) return [];
    const startIdx = mkToIndex(timelineStart);
    let cumulative = data.banks.reduce((s, b) => s + b.balance, 0);
    const rows = [];
    for (let i = 0; i < HORIZON; i++) {
      const mk = indexToMk(startIdx + i);
      let income = 0;
      data.incomes.forEach((inc) => {
        if (inc.type === "once") {
          if (inc.start === mk) income += inc.amount;
        } else {
          if (mkToIndex(mk) >= mkToIndex(inc.start) && (!inc.end || mkToIndex(mk) <= mkToIndex(inc.end))) income += inc.amount;
        }
      });
      let expense = 0;
      let breakdown = { recurring: 0, installments: 0, cards: 0, vendors: 0 };
      data.recurring.forEach((r) => {
        if (mkToIndex(mk) >= mkToIndex(r.start)) { expense += r.amount; breakdown.recurring += r.amount; }
      });
      data.installments.forEach((ins) => {
        const endIdx = mkToIndex(ins.start) + ins.months - 1;
        if (mkToIndex(mk) >= mkToIndex(ins.start) && mkToIndex(mk) <= endIdx) { expense += ins.monthly; breakdown.installments += ins.monthly; }
      });
      data.creditCards.forEach((c) => {
        if (mkToIndex(mk) >= mkToIndex(c.start)) { expense += c.minPayment; breakdown.cards += c.minPayment; }
      });
      data.vendorDebts.forEach((v) => {
        if (v.vadeMonth === mk) { expense += v.amount; breakdown.vendors += v.amount; }
      });
      const net = income - expense;
      cumulative += net;
      rows.push({ mk, income, expense, net, cumulative, breakdown });
    }
    return rows;
  }, [data, timelineStart]);

  if (loading || !data || !viewStart) {
    return (
      <div style={{ fontFamily: "ui-serif, Georgia, serif" }} className="min-h-screen flex items-center justify-center bg-[#EDE6D6] text-[#1B3630]">
        Defter açılıyor…
      </div>
    );
  }

  // ---- Auth gate ----
  if (!currentUser) {
    const showSetup = data.users.length === 0 || authMode === "setup";
    return (
      <div
        className="min-h-screen flex items-center justify-center px-5"
        style={{ background: "#EDE6D6", fontFamily: "ui-sans-serif, system-ui, sans-serif", color: "#241F16" }}
      >
        <div className="w-full max-w-sm rounded-lg border-2 p-6" style={{ borderColor: "#1B3630", background: "#F5F0E4" }}>
          <div className="flex items-center gap-2 mb-1" style={{ color: "#A8763E" }}>
            <Lock size={16} />
            <span className="text-xs tracking-[0.3em] uppercase">{showSetup ? "İlk Kurulum" : "Giriş"}</span>
          </div>
          <h1 style={{ fontFamily: "ui-serif, Georgia, serif", color: "#1B3630" }} className="text-2xl font-bold mb-4">
            Kasa Defteri
          </h1>

          {showSetup ? (
            <>
              <p className="text-sm mb-3 opacity-80">
                {data.users.length === 0 ? "Henüz kullanıcı yok. İlk kullanıcıyı oluştur." : "Yeni kullanıcı ekle."}
              </p>
              <input
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                placeholder="İsim"
                className="input w-full mb-2"
              />
              <input
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
                placeholder="Şifre"
                type="password"
                className="input w-full mb-3"
              />
              {authError && <div className="text-sm mb-2" style={{ color: "#A13D2B" }}>{authError}</div>}
              <button onClick={() => createUser(newUserName, newUserPassword)} className="btn-primary w-full mb-2">
                Oluştur
              </button>
              {data.users.length > 0 && (
                <button onClick={() => { setAuthMode("login"); setAuthError(""); }} className="text-sm underline w-full text-center" style={{ color: "#1B3630" }}>
                  Girişe dön
                </button>
              )}
            </>
          ) : (
            <>
              <select
                value={loginSelectedId}
                onChange={(e) => setLoginSelectedId(e.target.value)}
                className="input w-full mb-2"
              >
                <option value="">Kullanıcı seç</option>
                {data.users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
              <input
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Şifre"
                type="password"
                onKeyDown={(e) => e.key === "Enter" && attemptLogin()}
                className="input w-full mb-3"
              />
              {authError && <div className="text-sm mb-2" style={{ color: "#A13D2B" }}>{authError}</div>}
              <button onClick={attemptLogin} className="btn-primary w-full mb-2">Giriş Yap</button>
              <button onClick={() => { setAuthMode("setup"); setAuthError(""); }} className="text-sm underline w-full text-center" style={{ color: "#1B3630" }}>
                Yeni kullanıcı ekle
              </button>
            </>
          )}
          <p className="text-xs text-center mt-4 opacity-50">
            Bu basit bir erişim kontrolüdür, üst düzey güvenlik sağlamaz.
          </p>
        </div>
        <style>{`
          .input { padding: 8px 10px; border-radius: 6px; border: 1px solid #1B3630; background: white; display: block; }
          .btn-primary { padding: 8px 16px; border-radius: 6px; background: #1B3630; color: white; }
        `}</style>
      </div>
    );
  }

  // ---- CRUD ----
  const addBank = () => {
    if (!bankDraft.name.trim()) return;
    persist({ ...data, banks: [...data.banks, { id: uid(), name: bankDraft.name.trim(), balance: Number(bankDraft.balance) || 0 }] });
    setBankDraft({ name: "", balance: "" });
    setOpenForm(null);
  };
  const removeBank = (id) => persist({ ...data, banks: data.banks.filter((b) => b.id !== id) });

  const addInstallment = () => {
    if (!instDraft.name.trim() || !instDraft.monthly || !instDraft.months) return;
    persist({
      ...data,
      installments: [
        ...data.installments,
        { id: uid(), name: instDraft.name.trim(), monthly: Number(instDraft.monthly), start: instDraft.start, months: Number(instDraft.months) },
      ],
    });
    setInstDraft({ name: "", monthly: "", start: todayMK(), months: "" });
    setOpenForm(null);
  };
  const removeInstallment = (id) => persist({ ...data, installments: data.installments.filter((i) => i.id !== id) });

  const addRecurring = () => {
    if (!recDraft.name.trim() || !recDraft.amount) return;
    persist({ ...data, recurring: [...data.recurring, { id: uid(), name: recDraft.name.trim(), amount: Number(recDraft.amount), start: recDraft.start }] });
    setRecDraft({ name: "", amount: "", start: todayMK() });
    setOpenForm(null);
  };
  const removeRecurring = (id) => persist({ ...data, recurring: data.recurring.filter((r) => r.id !== id) });

  const addIncome = () => {
    if (!incDraft.name.trim() || !incDraft.amount) return;
    persist({
      ...data,
      incomes: [
        ...data.incomes,
        { id: uid(), name: incDraft.name.trim(), amount: Number(incDraft.amount), type: incDraft.type, start: incDraft.start, end: incDraft.type === "recurring" ? incDraft.end || null : null },
      ],
    });
    setIncDraft({ name: "", amount: "", type: "recurring", start: todayMK(), end: "" });
    setOpenForm(null);
  };
  const removeIncome = (id) => persist({ ...data, incomes: data.incomes.filter((i) => i.id !== id) });

  const addCard = () => {
    if (!cardDraft.name.trim() || !cardDraft.minPayment) return;
    persist({
      ...data,
      creditCards: [
        ...data.creditCards,
        { id: uid(), name: cardDraft.name.trim(), totalDebt: Number(cardDraft.totalDebt) || 0, minPayment: Number(cardDraft.minPayment), start: cardDraft.start },
      ],
    });
    setCardDraft({ name: "", totalDebt: "", minPayment: "", start: todayMK() });
    setOpenForm(null);
  };
  const removeCard = (id) => persist({ ...data, creditCards: data.creditCards.filter((c) => c.id !== id) });

  const addVendorDebt = () => {
    if (!vendorDraft.vendorName.trim() || !vendorDraft.amount) return;
    persist({
      ...data,
      vendorDebts: [
        ...data.vendorDebts,
        { id: uid(), vendorName: vendorDraft.vendorName.trim(), amount: Number(vendorDraft.amount), vadeMonth: vendorDraft.vadeMonth, note: vendorDraft.note.trim() },
      ],
    });
    setVendorDraft({ vendorName: "", amount: "", vadeMonth: todayMK(), note: "" });
    setOpenForm(null);
  };
  const removeVendorDebt = (id) => persist({ ...data, vendorDebts: data.vendorDebts.filter((v) => v.id !== id) });

  // ---- Forecast calculation ----
  const initialBalance = data.banks.reduce((s, b) => s + b.balance, 0);

  const breakEvenRow = initialBalance >= 0 ? forecast[0] : forecast.find((r) => r.cumulative >= 0);
  const viewIdx = forecast.findIndex((r) => r.mk === viewStart);
  const windowRows = forecast.slice(Math.max(0, viewIdx), Math.max(0, viewIdx) + 6);
  const canGoBack = mkToIndex(viewStart) > mkToIndex(timelineStart);
  const thisMonthRow = forecast.find((r) => r.mk === todayMK()) || forecast[0];

  const totalCardDebt = data.creditCards.reduce((s, c) => s + c.totalDebt, 0);
  const totalVendorDebt = data.vendorDebts.reduce((s, v) => s + v.amount, 0);
  const totalInstallmentRemaining = data.installments.reduce((s, ins) => {
    const endIdx = mkToIndex(ins.start) + ins.months - 1;
    const remaining = Math.max(0, Math.min(ins.months, endIdx - mkToIndex(todayMK()) + 1));
    return s + remaining * ins.monthly;
  }, 0);
  const totalDebtLoad = totalCardDebt + totalVendorDebt + totalInstallmentRemaining;

  // Guidance based on next 6 months from today
  const todayIdx = forecast.findIndex((r) => r.mk === todayMK());
  const next6 = forecast.slice(todayIdx, todayIdx + 6);
  const avgIncome = next6.reduce((s, r) => s + r.income, 0) / (next6.length || 1);
  const avgExpense = next6.reduce((s, r) => s + r.expense, 0) / (next6.length || 1);
  const ratio = avgIncome > 0 ? (avgExpense / avgIncome) * 100 : null;
  let guidanceLevel = "unknown";
  let guidanceText = "Yönlendirme için önce gelir gir.";
  if (ratio !== null) {
    if (ratio < 70) {
      guidanceLevel = "good";
      guidanceText = `Önümüzdeki 6 ayda giderlerin gelirinin ortalama %${ratio.toFixed(0)}'i kadar — nakit akışın sağlıklı görünüyor.`;
    } else if (ratio <= 100) {
      guidanceLevel = "warn";
      guidanceText = `Önümüzdeki 6 ayda giderlerin gelirinin ortalama %${ratio.toFixed(0)}'i kadar — tasarruf alanın oldukça dar, dikkatli ol.`;
    } else {
      guidanceLevel = "bad";
      guidanceText = `Önümüzdeki 6 ayda giderlerin gelirini ortalama %${(ratio - 100).toFixed(0)} aşıyor — bu dönemde ek finansmana ihtiyacın olabilir.`;
    }
  }
  const negativeMonths = next6.filter((r) => r.net < 0);
  const peakVendorMonth = data.vendorDebts.length
    ? [...new Set(data.vendorDebts.map((v) => v.vadeMonth))]
        .map((mk) => ({ mk, total: data.vendorDebts.filter((v) => v.vadeMonth === mk).reduce((s, v) => s + v.amount, 0) }))
        .sort((a, b) => b.total - a.total)[0]
    : null;

  return (
    <div
      className="min-h-screen"
      style={{
        background: "#EDE6D6",
        backgroundImage: "repeating-linear-gradient(#EDE6D6 0px, #EDE6D6 27px, #DDD2B8 28px)",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        color: "#241F16",
      }}
    >
      <div className="max-w-6xl mx-auto px-5 py-8">
        {/* Header */}
        <div className="mb-8 border-b-2 pb-4 flex items-end justify-between flex-wrap gap-2" style={{ borderColor: "#1B3630" }}>
          <div>
            <div className="text-xs tracking-[0.3em] uppercase mb-1" style={{ color: "#A8763E" }}>
              Nakit Akışı Takibi
            </div>
            <h1 style={{ fontFamily: "ui-serif, Georgia, 'Times New Roman', serif", color: "#1B3630" }} className="text-4xl font-bold tracking-tight">
              Kasa Defteri
            </h1>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="opacity-70">Merhaba, {currentUser.name}</span>
            <button
              onClick={() => { setAuthMode("setup"); setCurrentUser(null); }}
              className="flex items-center gap-1 px-2 py-1 rounded border"
              style={{ borderColor: "#1B3630", color: "#1B3630" }}
              title="Yeni kullanıcı ekle"
            >
              <UserPlus size={14} /> Kullanıcı ekle
            </button>
            <button onClick={logout} className="flex items-center gap-1 px-2 py-1 rounded border" style={{ borderColor: "#1B3630", color: "#1B3630" }}>
              <LogOut size={14} /> Çıkış
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 px-4 py-2 rounded text-sm" style={{ background: "#A13D2B22", color: "#A13D2B" }}>
            {error}
          </div>
        )}

        {/* Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <SummaryCard label="Mevcut Nakit" value={formatTL(initialBalance)} />
          <SummaryCard label="Bu Ay Net" value={formatTL(thisMonthRow.net)} accent={thisMonthRow.net < 0 ? "#A13D2B" : "#2F6B4F"} />
          <SummaryCard label="Bu Ay Kümülatif Bakiye" value={formatTL(thisMonthRow.cumulative)} accent={thisMonthRow.cumulative < 0 ? "#A13D2B" : "#2F6B4F"} />
          <SummaryCard
            label="Artıya Geçiş"
            value={initialBalance >= 0 ? "Zaten artıdasın" : breakEvenRow ? labelMk(breakEvenRow.mk) : "60 ay içinde yok"}
            accent="#2F6B4F"
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">
          <SummaryCard label="Toplam Kredi Kartı Borcu" value={formatTL(totalCardDebt)} accent="#A13D2B" />
          <SummaryCard label="Toplam Satıcı Borcu" value={formatTL(totalVendorDebt)} accent="#A13D2B" />
          <SummaryCard label="Toplam Borç Yükü (kalan)" value={formatTL(totalDebtLoad)} accent="#A13D2B" />
        </div>

        {/* Guidance */}
        <section
          className="mb-10 rounded-lg border-2 p-4 flex items-start gap-3"
          style={{
            borderColor: guidanceLevel === "bad" ? "#A13D2B" : guidanceLevel === "warn" ? "#A8763E" : "#2F6B4F",
            background: "#F5F0E4",
          }}
        >
          {guidanceLevel === "bad" ? (
            <AlertTriangle size={22} style={{ color: "#A13D2B", flexShrink: 0, marginTop: 2 }} />
          ) : (
            <CheckCircle2 size={22} style={{ color: guidanceLevel === "warn" ? "#A8763E" : "#2F6B4F", flexShrink: 0, marginTop: 2 }} />
          )}
          <div>
            <div className="font-semibold mb-1" style={{ fontFamily: "ui-serif, Georgia, serif" }}>Finansal Yönlendirme</div>
            <div className="text-sm">{guidanceText}</div>
            {negativeMonths.length > 0 && (
              <div className="text-sm mt-1" style={{ color: "#A13D2B" }}>
                Önümüzdeki 6 ayda net negatif olan aylar: {negativeMonths.map((r) => labelMk(r.mk)).join(", ")}
              </div>
            )}
            {peakVendorMonth && (
              <div className="text-sm mt-1 opacity-80">
                En yoğun satıcı vadesi: {labelMk(peakVendorMonth.mk)} ({formatTL(peakVendorMonth.total)})
              </div>
            )}
          </div>
        </section>

        {/* Chart */}
        <section className="mb-10 rounded-lg border-2 p-4" style={{ borderColor: "#1B3630", background: "#F5F0E4" }}>
          <h2 className="flex items-center gap-2 text-lg font-semibold mb-3" style={{ color: "#1B3630", fontFamily: "ui-serif, Georgia, serif" }}>
            <TrendingUp size={20} /> Kümülatif Bakiye Projeksiyonu
          </h2>
          <div style={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <ComposedChart data={forecast.slice(0, 24)} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#D8CCB3" />
                <XAxis dataKey="mk" tickFormatter={labelMk} tick={{ fontSize: 11 }} interval={1} />
                <YAxis tickFormatter={(v) => (v / 1000).toFixed(0) + "k"} tick={{ fontSize: 11 }} />
                <Tooltip
                  labelFormatter={labelMk}
                  formatter={(v, name) => [formatTL(v), name === "net" ? "Net" : name === "cumulative" ? "Kümülatif" : name]}
                />
                <ReferenceLine y={0} stroke="#A13D2B" strokeDasharray="4 4" />
                <Bar dataKey="net" fill="#A8763E" radius={[3, 3, 0, 0]} />
                <Line type="monotone" dataKey="cumulative" stroke="#1B3630" strokeWidth={2.5} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Monthly table */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold" style={{ color: "#1B3630", fontFamily: "ui-serif, Georgia, serif" }}>
              Aylık Finansal Tablo
            </h2>
            <div className="flex items-center gap-2">
              <button
                disabled={!canGoBack}
                onClick={() => setViewStart(addMonths(viewStart, -3))}
                className="w-8 h-8 rounded-full border-2 flex items-center justify-center disabled:opacity-30"
                style={{ borderColor: "#1B3630", color: "#1B3630" }}
              >
                <ArrowLeft size={14} />
              </button>
              <button
                onClick={() => setViewStart(addMonths(viewStart, 3))}
                className="w-8 h-8 rounded-full border-2 flex items-center justify-center"
                style={{ borderColor: "#1B3630", color: "#1B3630" }}
              >
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
          <div className="overflow-x-auto rounded-lg border-2" style={{ borderColor: "#1B3630" }}>
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#1B3630", color: "#EDE6D6" }}>
                  <th className="text-left px-3 py-2 font-medium">Ay</th>
                  <th className="text-right px-3 py-2 font-medium">Gelir</th>
                  <th className="text-right px-3 py-2 font-medium">Gider</th>
                  <th className="text-right px-3 py-2 font-medium">Net</th>
                  <th className="text-right px-3 py-2 font-medium">Kümülatif</th>
                  <th className="text-right px-3 py-2 font-medium">Gidere Oranı</th>
                </tr>
              </thead>
              <tbody>
                {windowRows.map((r, i) => {
                  const isBreakEven = breakEvenRow && r.mk === breakEvenRow.mk && initialBalance < 0;
                  const rowRatio = r.income > 0 ? (r.expense / r.income) * 100 : null;
                  const ratioColor = rowRatio === null ? "#5c5342" : rowRatio < 70 ? "#2F6B4F" : rowRatio <= 100 ? "#A8763E" : "#A13D2B";
                  return (
                    <tr key={r.mk} style={{ background: i % 2 === 0 ? "#F5F0E4" : "#EDE6D6" }}>
                      <td className="px-3 py-2 font-medium">
                        {labelMk(r.mk)} {r.mk === todayMK() && <span className="text-xs opacity-60">(bu ay)</span>}
                        {isBreakEven && <span className="ml-1 text-xs" style={{ color: "#2F6B4F" }}>● artıya geçiş</span>}
                      </td>
                      <td className="px-3 py-2 text-right" style={{ fontFamily: "ui-monospace, monospace" }}>{formatTL(r.income)}</td>
                      <td className="px-3 py-2 text-right" style={{ fontFamily: "ui-monospace, monospace" }}>{formatTL(r.expense)}</td>
                      <td className="px-3 py-2 text-right font-semibold" style={{ fontFamily: "ui-monospace, monospace", color: r.net < 0 ? "#A13D2B" : "#2F6B4F" }}>
                        {formatTL(r.net)}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold" style={{ fontFamily: "ui-monospace, monospace", color: r.cumulative < 0 ? "#A13D2B" : "#2F6B4F" }}>
                        {formatTL(r.cumulative)}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold" style={{ fontFamily: "ui-monospace, monospace", color: ratioColor }}>
                        {rowRatio === null ? "—" : `%${rowRatio.toFixed(0)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Banks */}
        <Section icon={<Landmark size={20} />} title="Bankalar / Mevcut Nakit" onAdd={() => setOpenForm(openForm === "bank" ? null : "bank")} addLabel="Hesap Ekle">
          {openForm === "bank" && (
            <FormRow>
              <input value={bankDraft.name} onChange={(e) => setBankDraft({ ...bankDraft, name: e.target.value })} placeholder="Banka adı" className="input flex-1 min-w-[140px]" />
              <input value={bankDraft.balance} onChange={(e) => setBankDraft({ ...bankDraft, balance: e.target.value })} placeholder="Bakiye" type="number" className="input w-32" />
              <button onClick={addBank} className="btn-primary">Ekle</button>
            </FormRow>
          )}
          {data.banks.length === 0 ? (
            <Empty text="Henüz banka hesabı eklenmedi." />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {data.banks.map((b) => (
                <Card key={b.id} onDelete={() => removeBank(b.id)}>
                  <div className="font-semibold">{b.name}</div>
                  <div style={{ fontFamily: "ui-monospace, monospace" }} className="text-sm">{formatTL(b.balance)}</div>
                </Card>
              ))}
            </div>
          )}
        </Section>

        {/* Credit cards */}
        <Section icon={<CreditCard size={20} />} title="Kredi Kartları" onAdd={() => setOpenForm(openForm === "card" ? null : "card")} addLabel="Kart Ekle">
          {openForm === "card" && (
            <FormRow>
              <input value={cardDraft.name} onChange={(e) => setCardDraft({ ...cardDraft, name: e.target.value })} placeholder="Kart adı" className="input flex-1 min-w-[140px]" />
              <input value={cardDraft.totalDebt} onChange={(e) => setCardDraft({ ...cardDraft, totalDebt: e.target.value })} placeholder="Toplam borç" type="number" className="input w-32" />
              <input value={cardDraft.minPayment} onChange={(e) => setCardDraft({ ...cardDraft, minPayment: e.target.value })} placeholder="Asgari ödeme" type="number" className="input w-32" />
              <input value={cardDraft.start} onChange={(e) => setCardDraft({ ...cardDraft, start: e.target.value })} type="month" className="input w-36" />
              <button onClick={addCard} className="btn-primary">Ekle</button>
            </FormRow>
          )}
          {data.creditCards.length === 0 ? (
            <Empty text="Henüz kredi kartı eklenmedi." />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {data.creditCards.map((c) => (
                <Card key={c.id} onDelete={() => removeCard(c.id)}>
                  <div className="font-semibold">{c.name}</div>
                  <div className="text-xs opacity-70 mt-1">Toplam borç: <span style={{ fontFamily: "ui-monospace, monospace" }}>{formatTL(c.totalDebt)}</span></div>
                  <div className="text-xs opacity-70">Asgari ödeme: <span style={{ fontFamily: "ui-monospace, monospace" }}>{formatTL(c.minPayment)}</span> / ay</div>
                </Card>
              ))}
            </div>
          )}
        </Section>

        {/* Vendor debts */}
        <Section icon={<Store size={20} />} title="Satıcı Borçları / Vadeler" onAdd={() => setOpenForm(openForm === "vendor" ? null : "vendor")} addLabel="Vade Ekle">
          {openForm === "vendor" && (
            <FormRow>
              <input value={vendorDraft.vendorName} onChange={(e) => setVendorDraft({ ...vendorDraft, vendorName: e.target.value })} placeholder="Satıcı adı" className="input flex-1 min-w-[140px]" />
              <input value={vendorDraft.amount} onChange={(e) => setVendorDraft({ ...vendorDraft, amount: e.target.value })} placeholder="Tutar" type="number" className="input w-32" />
              <input value={vendorDraft.vadeMonth} onChange={(e) => setVendorDraft({ ...vendorDraft, vadeMonth: e.target.value })} type="month" className="input w-36" />
              <input value={vendorDraft.note} onChange={(e) => setVendorDraft({ ...vendorDraft, note: e.target.value })} placeholder="Not (opsiyonel)" className="input flex-1 min-w-[120px]" />
              <button onClick={addVendorDebt} className="btn-primary">Ekle</button>
            </FormRow>
          )}
          <p className="text-xs opacity-60 mb-2">Bir satıcıya birden fazla vade/çek varsa, her biri için ayrı satır ekle.</p>
          {data.vendorDebts.length === 0 ? (
            <Empty text="Henüz satıcı borcu eklenmedi." />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {data.vendorDebts
                .slice()
                .sort((a, b) => mkToIndex(a.vadeMonth) - mkToIndex(b.vadeMonth))
                .map((v) => (
                  <Card key={v.id} onDelete={() => removeVendorDebt(v.id)}>
                    <div className="font-semibold">{v.vendorName}</div>
                    <div style={{ fontFamily: "ui-monospace, monospace" }} className="text-sm">{formatTL(v.amount)}</div>
                    <div className="text-xs opacity-70 mt-1">Vade: {labelMk(v.vadeMonth)}{v.note ? ` · ${v.note}` : ""}</div>
                  </Card>
                ))}
            </div>
          )}
        </Section>

        {/* Installments */}
        <Section icon={<Wallet size={20} />} title="Taksitli Alımlar" onAdd={() => setOpenForm(openForm === "inst" ? null : "inst")} addLabel="Alım Ekle">
          {openForm === "inst" && (
            <FormRow>
              <input value={instDraft.name} onChange={(e) => setInstDraft({ ...instDraft, name: e.target.value })} placeholder="Ürün adı" className="input flex-1 min-w-[140px]" />
              <input value={instDraft.monthly} onChange={(e) => setInstDraft({ ...instDraft, monthly: e.target.value })} placeholder="Aylık taksit" type="number" className="input w-32" />
              <input value={instDraft.months} onChange={(e) => setInstDraft({ ...instDraft, months: e.target.value })} placeholder="Kaç ay" type="number" className="input w-24" />
              <input value={instDraft.start} onChange={(e) => setInstDraft({ ...instDraft, start: e.target.value })} type="month" className="input w-36" />
              <button onClick={addInstallment} className="btn-primary">Ekle</button>
            </FormRow>
          )}
          {data.installments.length === 0 ? (
            <Empty text="Henüz taksitli alım eklenmedi." />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {data.installments.map((ins) => {
                const endMk = addMonths(ins.start, ins.months - 1);
                const remaining = Math.max(0, Math.min(ins.months, mkToIndex(endMk) - mkToIndex(todayMK()) + 1));
                return (
                  <Card key={ins.id} onDelete={() => removeInstallment(ins.id)}>
                    <div className="font-semibold">{ins.name}</div>
                    <div style={{ fontFamily: "ui-monospace, monospace" }} className="text-sm">{formatTL(ins.monthly)} / ay</div>
                    <div className="text-xs opacity-70 mt-1">
                      {labelMk(ins.start)} → {labelMk(endMk)} · kalan {remaining} taksit
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </Section>

        {/* Recurring */}
        <Section icon={<Repeat size={20} />} title="Düzenli Ödemeler" onAdd={() => setOpenForm(openForm === "rec" ? null : "rec")} addLabel="Ödeme Ekle">
          {openForm === "rec" && (
            <FormRow>
              <input value={recDraft.name} onChange={(e) => setRecDraft({ ...recDraft, name: e.target.value })} placeholder="Kira, fatura..." className="input flex-1 min-w-[140px]" />
              <input value={recDraft.amount} onChange={(e) => setRecDraft({ ...recDraft, amount: e.target.value })} placeholder="Tutar" type="number" className="input w-32" />
              <input value={recDraft.start} onChange={(e) => setRecDraft({ ...recDraft, start: e.target.value })} type="month" className="input w-36" />
              <button onClick={addRecurring} className="btn-primary">Ekle</button>
            </FormRow>
          )}
          {data.recurring.length === 0 ? (
            <Empty text="Henüz düzenli ödeme eklenmedi." />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {data.recurring.map((r) => (
                <Card key={r.id} onDelete={() => removeRecurring(r.id)}>
                  <div className="font-semibold">{r.name}</div>
                  <div style={{ fontFamily: "ui-monospace, monospace" }} className="text-sm">{formatTL(r.amount)} / ay</div>
                  <div className="text-xs opacity-70 mt-1">{labelMk(r.start)} itibaren</div>
                </Card>
              ))}
            </div>
          )}
        </Section>

        {/* Incomes */}
        <Section icon={<TrendingUp size={20} />} title="Gelirler / Nakit Girişleri" onAdd={() => setOpenForm(openForm === "inc" ? null : "inc")} addLabel="Gelir Ekle">
          {openForm === "inc" && (
            <FormRow>
              <input value={incDraft.name} onChange={(e) => setIncDraft({ ...incDraft, name: e.target.value })} placeholder="Maaş, ek gelir..." className="input flex-1 min-w-[140px]" />
              <input value={incDraft.amount} onChange={(e) => setIncDraft({ ...incDraft, amount: e.target.value })} placeholder="Tutar" type="number" className="input w-32" />
              <select value={incDraft.type} onChange={(e) => setIncDraft({ ...incDraft, type: e.target.value })} className="input">
                <option value="recurring">Düzenli (her ay)</option>
                <option value="once">Tek seferlik</option>
              </select>
              <input value={incDraft.start} onChange={(e) => setIncDraft({ ...incDraft, start: e.target.value })} type="month" className="input w-36" />
              {incDraft.type === "recurring" && (
                <input value={incDraft.end} onChange={(e) => setIncDraft({ ...incDraft, end: e.target.value })} type="month" placeholder="Bitiş (opsiyonel)" className="input w-36" />
              )}
              <button onClick={addIncome} className="btn-primary">Ekle</button>
            </FormRow>
          )}
          {data.incomes.length === 0 ? (
            <Empty text="Henüz gelir eklenmedi." />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {data.incomes.map((inc) => (
                <Card key={inc.id} onDelete={() => removeIncome(inc.id)}>
                  <div className="font-semibold">{inc.name}</div>
                  <div style={{ fontFamily: "ui-monospace, monospace" }} className="text-sm">{formatTL(inc.amount)}</div>
                  <div className="text-xs opacity-70 mt-1">
                    {inc.type === "once" ? `${labelMk(inc.start)} (tek seferlik)` : `${labelMk(inc.start)}${inc.end ? " → " + labelMk(inc.end) : " itibaren sürekli"}`}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </Section>

        <p className="text-xs text-center mt-8 opacity-50">
          Veriler bu cihazda (tarayıcında) saklanır — başka bir cihazla otomatik paylaşılmaz.
        </p>
      </div>
      <style>{`
        .input { padding: 6px 10px; border-radius: 6px; border: 1px solid #1B3630; background: white; }
        .btn-primary { padding: 6px 16px; border-radius: 6px; background: #1B3630; color: white; }
      `}</style>
    </div>
  );
}

function SummaryCard({ label, value, accent }) {
  return (
    <div className="rounded-lg p-4 border-2" style={{ borderColor: "#1B3630", background: "#F5F0E4" }}>
      <div className="text-xs uppercase tracking-wide mb-1" style={{ color: "#A8763E" }}>{label}</div>
      <div style={{ fontFamily: "ui-monospace, monospace", color: accent || "#241F16" }} className="text-xl font-bold">{value}</div>
    </div>
  );
}

function Section({ icon, title, onAdd, addLabel, children }) {
  return (
    <section className="mb-10">
      <div className="flex items-center justify-between mb-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold" style={{ color: "#1B3630", fontFamily: "ui-serif, Georgia, serif" }}>
          {icon} {title}
        </h2>
        <button onClick={onAdd} className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-full border-2 hover:bg-white/50 transition" style={{ borderColor: "#1B3630", color: "#1B3630" }}>
          <Plus size={14} /> {addLabel}
        </button>
      </div>
      {children}
    </section>
  );
}

function FormRow({ children }) {
  return (
    <div className="flex flex-wrap gap-2 mb-4 p-3 rounded-lg border-2 border-dashed" style={{ borderColor: "#A8763E" }}>
      {children}
    </div>
  );
}

function Card({ children, onDelete }) {
  return (
    <div className="rounded-lg p-3 border-2 flex items-start justify-between" style={{ borderColor: "#1B3630", background: "#F5F0E4" }}>
      <div>{children}</div>
      <button onClick={onDelete} className="opacity-40 hover:opacity-100 transition shrink-0 ml-2">
        <Trash2 size={16} />
      </button>
    </div>
  );
}

function Empty({ text }) {
  return <p className="text-sm italic" style={{ color: "#5c5342" }}>{text}</p>;
}
