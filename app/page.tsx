"use client";

import { useEffect, useMemo, useState } from "react";

type Topic = "Туризм" | "Культура" | "Освіта";
type Decision = "SUBMITTED" | "GO" | "PARTNER" | "PREPARE" | "MONITOR" | "NO-GO";
type Grant = {
  id: string; title: string; organisation: string; deadline: string | null;
  deadlineLabel: string; topics: Topic[]; amount: string; applicant: string;
  summary: string; url: string; score: number; decision: Decision; idea: string;
  owner: string; internalDeadline: string; nextAction: string; risk: string;
  fit: [number, number, number, number, number];
};
type DecisionState = Record<string, { decision: Decision; owner: string; nextAction: string }>;

const decisions: Record<Decision, { label: string; hint: string }> = {
  SUBMITTED: { label: "Подано", hint: "Очікуємо рішення" },
  GO: { label: "Подаємося", hint: "Готуємо заявку" },
  PARTNER: { label: "Партнерство", hint: "Шукаємо роль або консорціум" },
  PREPARE: { label: "Готуємося", hint: "Створюємо заділ на наступний раунд" },
  MONITOR: { label: "Спостерігаємо", hint: "Повертаємося після оновлення умов" },
  "NO-GO": { label: "Не подаємося", hint: "Не витрачаємо ресурс" },
};
const decisionKeys = Object.keys(decisions) as Decision[];
const criteria = [
  "Зміст ВАГ",
  "Право участі",
  "Партнерська готовність",
  "Реалістичність строку",
  "Бюджет / складність",
];

const FALLBACK_GRANTS: Grant[] = [
  {
    "id": "heritage-hub",
    "title": "Small Grants Scheme for Cultural Heritage",
    "organisation": "European Heritage Hub",
    "deadline": null,
    "deadlineLabel": "Подано 6 вересня · очікує розгляду",
    "topics": [
      "Культура",
      "Туризм",
      "Освіта"
    ],
    "amount": "до €25 000",
    "applicant": "Українські організації громадянського суспільства",
    "summary": "Заявку «Memory Routes of Kyiv Region: Community-led Documentation and Inclusive Interpretation» успішно подано; очікується review.",
    "url": "https://www.europeanheritagehub.eu/funding/call-for-applications-small-grants-scheme-for-heritage-related-projects-led-by-civil-society-in-eu-candidate-and-neighbouring-countries/",
    "score": 8,
    "decision": "SUBMITTED",
    "idea": "Memory Routes of Kyiv Region: Community-led Documentation and Inclusive Interpretation",
    "owner": "Яніна Гаврилова / В’ячеслав Арещенко",
    "internalDeadline": "—",
    "nextAction": "Очікувати результат розгляду та оперативно відповідати на можливі запити European Heritage Hub",
    "risk": "Не пропустити листи щодо уточнень, eligibility або наступного етапу",
    "fit": [
      2,
      2,
      1,
      2,
      2
    ]
  },
  {
    "id": "eit-cpd",
    "title": "Skills-based CPD Courses",
    "organisation": "EIT Culture & Creativity",
    "deadline": "2026-09-14T17:00:00+02:00",
    "deadlineLabel": "14 вересня · 17:00 CEST",
    "topics": [
      "Освіта",
      "Культура"
    ],
    "amount": "до €75 000 · 75%",
    "applicant": "Освітній координатор; консорціум до 3 учасників",
    "summary": "Практичні англомовні CPD-курси для аудіовізуального сектору: AI, IP або digital storytelling.",
    "url": "https://eit-culture-creativity.eu/your-opportunities/calls-funding/skills-based-cpd-courses",
    "score": 8,
    "decision": "PARTNER",
    "idea": "Digital storytelling для інтерпретації спадщини та маршрутів пам’яті",
    "owner": "В’ячеслав Арещенко",
    "internalDeadline": "9 вересня · 18:00 EEST",
    "nextAction": "Підтвердити акредитованого освітнього координатора та AV-партнера",
    "risk": "ВАГ не може бути одноосібним заявником без статусу акредитованого провайдера",
    "fit": [
      2,
      1,
      2,
      2,
      1
    ]
  },
  {
    "id": "town-twinning",
    "title": "Town Twinning 2026",
    "organisation": "CERV · European Commission",
    "deadline": "2026-09-23T17:00:00+02:00",
    "deadlineLabel": "23 вересня · 17:00 CEST",
    "topics": [
      "Культура",
      "Туризм",
      "Освіта"
    ],
    "amount": "lump sum",
    "applicant": "Муніципалітети та неприбуткові партнери",
    "summary": "Співпраця громад, європейська пам’ять, культурне різноманіття та громадянська участь.",
    "url": "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/calls-for-proposals?callIdentifier=CERV-2026-CITIZENS-TOWN-TT",
    "score": 6,
    "decision": "PARTNER",
    "idea": "Міста пам’яті й гостинності: Київщина та європейська громада",
    "owner": "Яніна Гаврилова",
    "internalDeadline": "10 вересня",
    "nextAction": "Визначити український муніципалітет і підтвердити європейське місто-партнера",
    "risk": "Без муніципального лідерства заявка нереалістична",
    "fit": [
      2,
      1,
      1,
      1,
      1
    ]
  },
  {
    "id": "uyf-institutional",
    "title": "Інституційна підтримка молодіжних та дитячих громадських об’єднань",
    "organisation": "Український молодіжний фонд",
    "deadline": "2026-09-23T12:00:00+03:00",
    "deadlineLabel": "23 вересня · 12:00 Київ",
    "topics": [
      "Освіта"
    ],
    "amount": "до 1 000 000 грн",
    "applicant": "Молодіжні та дитячі громадські об’єднання; eligibility ВАГ треба підтвердити",
    "summary": "Інституційний розвиток, фінансова сталість, якість молодіжної роботи та посилення організаційної спроможності.",
    "url": "https://uyf.gov.ua/programs/nadannia-instytutsiinoi-pidtrymky",
    "score": 6,
    "decision": "PREPARE",
    "idea": "Інституційний розвиток ВАГ: цифрові інструменти, спроможність, членство та партнерства",
    "owner": "Яніна Гаврилова",
    "internalDeadline": "10 вересня · eligibility check",
    "nextAction": "Перевірити чинний Статут ВАГ і юридичну відповідність вимогам конкурсу до підготовки заявки",
    "risk": "ВАГ може не відповідати вузькій вимозі щодо статусу молодіжного/дитячого громадського об’єднання",
    "fit": [
      2,
      0,
      2,
      1,
      1
    ]
  },
  {
    "id": "visegrad-plus",
    "title": "Visegrad+ Grants",
    "organisation": "International Visegrad Fund",
    "deadline": "2026-10-01T12:00:00+02:00",
    "deadlineLabel": "1 жовтня · 12:00 CEST",
    "topics": [
      "Культура",
      "Освіта",
      "Туризм"
    ],
    "amount": "типово €25–35 тис.",
    "applicant": "Українська організація + партнери V4",
    "summary": "Транскордонні проєкти у культурі, освіті, розвитку спроможності та демократичній трансформації.",
    "url": "https://www.visegradfund.org/visegrad-plus-grants-apply",
    "score": 8,
    "decision": "GO",
    "idea": "Князівський бенкет: гастрономічна дипломатія України та Словаччини",
    "owner": "Яніна Гаврилова",
    "internalDeadline": "18 вересня",
    "nextAction": "Підтвердити словацького партнера та залучити ще одну організацію з V4",
    "risk": "Потрібна переконлива регіональна користь, не лише двостороння подія",
    "fit": [
      2,
      2,
      1,
      1,
      2
    ]
  },
  {
    "id": "memory-action",
    "title": "Memory in Action — Project Grants",
    "organisation": "Culture Helps Solidarity",
    "deadline": "2026-10-06T14:00:00+03:00",
    "deadlineLabel": "6 жовтня",
    "topics": [
      "Культура",
      "Освіта",
      "Туризм"
    ],
    "amount": "до €7 000",
    "applicant": "Культурні та громадські організації й ініціативи",
    "summary": "Відповідальна робота з пам’яттю, документуванням і досвідом людей, яких торкнулася війна.",
    "url": "https://culturehelpssolidarity.eu/project-grants/",
    "score": 10,
    "decision": "GO",
    "idea": "Маршрути пам’яті Київщини: голоси громад і етичне вшанування",
    "owner": "Яніна Гаврилова",
    "internalDeadline": "25 вересня",
    "nextAction": "Зафіксувати одну громаду, цільову групу та конкретний культурний результат",
    "risk": "Не перетворити культурний проєкт на туристичний тур або терапевтичну послугу",
    "fit": [
      2,
      2,
      2,
      2,
      2
    ]
  },
  {
    "id": "eit-shape-scale",
    "title": "Shape & Scale for creative tech",
    "organisation": "EIT Culture & Creativity",
    "deadline": "2026-10-12T17:00:00+02:00",
    "deadlineLabel": "12 жовтня · 17:00 CEST",
    "topics": [
      "Культура",
      "Освіта"
    ],
    "amount": "до €100 000 / €500 000",
    "applicant": "Прибуткові creative-tech компанії",
    "summary": "Фінансування й акселерація компаній в архітектурі, аудіовізуальних медіа та моді.",
    "url": "https://eit-culture-creativity.eu/latest-news/2026-08-07-eit-culture-creativity-opens-eur86m-funding-and-growth-programmes-accelerate",
    "score": 3,
    "decision": "NO-GO",
    "idea": "Окремий комерційний spin-off EIP — лише після валідації моделі",
    "owner": "—",
    "internalDeadline": "—",
    "nextAction": "Не витрачати ресурс ВАГ у цьому раунді",
    "risk": "ВАГ не є прибутковою creative-tech компанією; спадщина не у фокусі 2026",
    "fit": [
      1,
      0,
      1,
      0,
      1
    ]
  },
  {
    "id": "collaboration-grants",
    "title": "Collaboration Grants — другий раунд",
    "organisation": "Culture Helps Solidarity",
    "deadline": "2026-11-10T14:00:00+02:00",
    "deadlineLabel": "10 листопада · 14:00 Київ",
    "topics": [
      "Культура",
      "Освіта"
    ],
    "amount": "до €20 000 / €30 000",
    "applicant": "Українська організація + партнер із Creative Europe",
    "summary": "Міжнародні культурні проєкти для інтеграції, ментального добробуту, вразливих груп і ветеранів.",
    "url": "https://culturehelpssolidarity.eu/collaboration-grants/",
    "score": 9,
    "decision": "PARTNER",
    "idea": "Інклюзивні маршрути й культурне відновлення ветеранів через міжнародний обмін",
    "owner": "Яніна Гаврилова",
    "internalDeadline": "20 жовтня",
    "nextAction": "Взяти участь у matchmaking 15 вересня та узгодити європейського партнера",
    "risk": "Проєкт має бути культурним і транскордонним, а не лише навчальним",
    "fit": [
      2,
      2,
      1,
      2,
      2
    ]
  },
  {
    "id": "zmina-showcasing",
    "title": "ZMINA:Resilience — International Showcasing",
    "organisation": "IZOLYATSIA / ZMINA:Resilience",
    "deadline": "2026-12-14T23:59:00+02:00",
    "deadlineLabel": "14 грудня · 23:59 Київ",
    "topics": [
      "Культура"
    ],
    "amount": "до €50 000 · до 90%",
    "applicant": "Щонайменше 2 організації з 2 країн Creative Europe; одна — Україна",
    "summary": "Міжнародне поширення вже створених у співпраці культурних робіт про стійкість; мінімум 6 публічних показів у щонайменше 2 країнах.",
    "url": "https://platform.izolyatsia.org/ua/contest/zmina-resilience-showcasing-1",
    "score": 7,
    "decision": "PARTNER",
    "idea": "Міжнародне поширення спільно створеного культурного продукту ВАГ про пам’ять, стійкість та інтерпретацію спадщини",
    "owner": "Яніна Гаврилова",
    "internalDeadline": "31 жовтня · go/no-go",
    "nextAction": "Визначити наявний co-created cultural work і підтвердити міжнародного партнера; цілитися в раунд 14 грудня",
    "risk": "Конкурс фінансує showcasing уже спільно створених робіт, а не створення нового продукту з нуля; потрібен 10% грошовий внесок",
    "fit": [
      2,
      2,
      1,
      1,
      1
    ]
  },
  {
    "id": "eed",
    "title": "Flexible Support",
    "organisation": "European Endowment for Democracy",
    "deadline": null,
    "deadlineLabel": "Постійний прийом",
    "topics": [
      "Культура",
      "Освіта"
    ],
    "amount": "за потребами проєкту",
    "applicant": "Організації, неформальні групи й активісти",
    "summary": "Гнучка підтримка ініціатив із чітким демократичним, правозахисним або адвокаційним результатом.",
    "url": "https://democracyendowment.eu/support",
    "score": 5,
    "decision": "MONITOR",
    "idea": "Професійне представництво гідів і доступ до культурної участі",
    "owner": "—",
    "internalDeadline": "—",
    "nextAction": "Повертатися лише під сильний адвокаційний проєкт",
    "risk": "Звичайна культурна або освітня діяльність не відповідає мандату",
    "fit": [
      1,
      2,
      1,
      1,
      0
    ]
  },
  {
    "id": "pollination",
    "title": "Daily Seed Grants",
    "organisation": "The Pollination Project",
    "deadline": null,
    "deadlineLabel": "Постійний прийом",
    "topics": [
      "Освіта",
      "Культура",
      "Туризм"
    ],
    "amount": "до $500",
    "applicant": "Ранні волонтерські ініціативи без оплачуваного штату",
    "summary": "Невелика стартова підтримка для нових волонтерських ініціатив із соціальним результатом.",
    "url": "https://thepollinationproject.org/apply/",
    "score": 2,
    "decision": "NO-GO",
    "idea": "Не відповідає організаційній моделі ВАГ",
    "owner": "—",
    "internalDeadline": "—",
    "nextAction": "Не подаватися від ВАГ",
    "risk": "Обмеження щодо оплачуваного штату та надто малий бюджет",
    "fit": [
      1,
      0,
      0,
      1,
      0
    ]
  },
  {
    "id": "cove-next",
    "title": "Centres of Vocational Excellence",
    "organisation": "Erasmus+ · наступний цикл",
    "deadline": null,
    "deadlineLabel": "Підготовка до нового раунду",
    "topics": [
      "Освіта",
      "Туризм"
    ],
    "amount": "великий консорціумний грант",
    "applicant": "Міжнародний консорціум VET, бізнесу та професійних партнерів",
    "summary": "Міжнародна екосистема професійної досконалості, кваліфікацій, навчання й визнання навичок.",
    "url": "https://erasmus-plus.ec.europa.eu/programme-guide/part-b/key-action-2/centres-of-vocational-excellence",
    "score": 8,
    "decision": "PREPARE",
    "idea": "European Centre of Excellence for Tourist Guiding and Heritage Interpretation",
    "owner": "Яніна Гаврилова",
    "internalDeadline": "грудень 2026",
    "nextAction": "Сформувати концепцію та карту VET/університетських партнерів до відкриття раунду",
    "risk": "Потрібні сильний координатор і довготривала підготовка консорціуму",
    "fit": [
      2,
      1,
      1,
      2,
      2
    ]
  }
];

type FeedMeta = {
  updatedAt?: string;
  source?: string;
  version?: number;
};

const DEFAULT_FEED_URL = process.env.NEXT_PUBLIC_GRANT_FEED_URL || "/grants.json";
const FEED_URL_STORAGE_KEY = "vag-grant-feed-url-v1";

function validateGrantFeed(value: unknown): value is Grant[] {
  if (!Array.isArray(value)) return false;
  return value.every((g) => {
    if (!g || typeof g !== "object") return false;
    const x = g as Partial<Grant>;
    return Boolean(
      x.id && x.title && x.organisation && x.deadlineLabel &&
      Array.isArray(x.topics) && typeof x.url === "string" && x.url.startsWith("https://") &&
      typeof x.score === "number" && typeof x.decision === "string" &&
      Array.isArray(x.fit) && x.fit.length === 5
    );
  });
}

function metaUrlFor(feedUrl: string) {
  return feedUrl.endsWith("grants.json")
    ? feedUrl.slice(0, -"grants.json".length) + "catalogue-meta.json"
    : null;
}

function formatUpdatedAt(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("uk-UA", {
    day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit"
  }).format(date);
}


function daysUntil(deadline: string | null) {
  return deadline ? Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000) : null;
}
function urgency(grant: Grant) {
  const days = daysUntil(grant.deadline);
  if (days === null) return grant.decision === "PREPARE" ? "prepare" : "rolling";
  if (days < 0) return "expired";
  if (days <= 7) return "urgent";
  if (days <= 30) return "soon";
  return "later";
}

export default function DecisionDashboard() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Decision | "ALL">("ALL");
  const [sort, setSort] = useState<"deadline" | "score">("deadline");
  const [overrides, setOverrides] = useState<DecisionState>({});
  const [expanded, setExpanded] = useState<string | null>("memory-action");
  const [catalogue, setCatalogue] = useState<Grant[]>(FALLBACK_GRANTS);
  const [feedMeta, setFeedMeta] = useState<FeedMeta>({});
  const [feedStatus, setFeedStatus] = useState<"loading" | "live" | "fallback" | "error">("loading");
  const [feedUrl, setFeedUrl] = useState(DEFAULT_FEED_URL);

  useEffect(() => {
    try {
      const stored = localStorage.getItem("vag-grant-decisions-v1");
      if (stored) setOverrides(JSON.parse(stored));
      const storedFeed = localStorage.getItem(FEED_URL_STORAGE_KEY);
      if (storedFeed) setFeedUrl(storedFeed);
    } catch { /* device storage is optional */ }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;

    const refresh = async () => {
      setFeedStatus((current) => current === "live" ? current : "loading");
      try {
        const response = await fetch(feedUrl, { cache: "no-store", headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error(`Grant feed HTTP ${response.status}`);
        const payload: unknown = await response.json();
        if (!validateGrantFeed(payload)) throw new Error("Grant feed schema validation failed");
        if (cancelled) return;
        setCatalogue(payload);
        setFeedStatus("live");

        const metaUrl = metaUrlFor(feedUrl);
        if (metaUrl) {
          try {
            const metaResponse = await fetch(metaUrl, { cache: "no-store", headers: { Accept: "application/json" } });
            if (metaResponse.ok && !cancelled) setFeedMeta(await metaResponse.json());
          } catch { /* meta is optional */ }
        }
      } catch (error) {
        if (cancelled) return;
        console.error("Grant feed refresh failed", error);
        setFeedStatus(catalogue.length ? "fallback" : "error");
      }
    };

    refresh();
    timer = setInterval(refresh, 15 * 60 * 1000);
    return () => { cancelled = true; if (timer) clearInterval(timer); };
    // feed URL changes only when the external source is reconfigured.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedUrl]);

  const items = useMemo(
    () => catalogue.map((grant) => ({ ...grant, ...(overrides[grant.id] || {}) })),
    [catalogue, overrides],
  );
  const updateDecision = (id: string, patch: Partial<DecisionState[string]>) => {
    setOverrides((current) => {
      const original = catalogue.find((grant) => grant.id === id)!;
      const next = {
        ...current,
        [id]: {
          decision: current[id]?.decision ?? original.decision,
          owner: current[id]?.owner ?? original.owner,
          nextAction: current[id]?.nextAction ?? original.nextAction,
          ...patch,
        },
      };
      try { localStorage.setItem("vag-grant-decisions-v1", JSON.stringify(next)); } catch { /* optional */ }
      return next;
    });
  };
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("uk-UA");
    return items
      .filter((grant) => filter === "ALL" || grant.decision === filter)
      .filter((grant) => !needle || [grant.title, grant.organisation, grant.idea, grant.nextAction, ...grant.topics].join(" ").toLocaleLowerCase("uk-UA").includes(needle))
      .sort((a, b) => {
        if (sort === "score") return b.score - a.score;
        if (!a.deadline && !b.deadline) return b.score - a.score;
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      });
  }, [items, filter, query, sort]);
  const counts = decisionKeys.reduce(
    (result, key) => ({ ...result, [key]: items.filter((grant) => grant.decision === key).length }),
    {} as Record<Decision, number>,
  );
  const focus = items.filter(
    (grant) => ["GO", "PARTNER"].includes(grant.decision) && (daysUntil(grant.deadline) ?? 999) <= 30,
  );
  const reveal = (id: string) => {
    setFilter("ALL");
    setExpanded(id);
    window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" }), 20);
  };

  return (
    <main>
      <header className="app-header">
        <a className="brand" href="#top" aria-label="Панель грантових рішень ВАГ — на початок">
          <span className="brand-mark">ВАГ</span>
          <span><strong>ГрантНавігатор</strong><small>Панель рішень</small></span>
        </a>
        <div className={`verified feed-${feedStatus}`} title={`Джерело: ${feedUrl}`}><span />{feedStatus === "live" ? `LIVE · ${formatUpdatedAt(feedMeta.updatedAt) || "автооновлення"}` : feedStatus === "loading" ? "Оновлення каталогу…" : "Резервні дані"}</div>
      </header>

      <div className="dashboard" id="top">
        <section className="dashboard-title">
          <div><p className="eyebrow">РОБОЧИЙ ПРІОРИТЕТ</p><h1>Що робимо з кожною можливістю</h1></div>
          <p>Рішення, відповідальні та найближчі кроки ВАГ. Зміни зберігаються на цьому пристрої.</p>
        </section>

        <nav className="decision-strip" aria-label="Статистика рішень">
          {decisionKeys.map((key) => (
            <button key={key} className={`decision-stat ${key.toLowerCase()} ${filter === key ? "active" : ""}`} onClick={() => setFilter(filter === key ? "ALL" : key)}>
              <span>{key}</span><strong>{counts[key]}</strong><small>{decisions[key].label}</small>
            </button>
          ))}
        </nav>

        <section className="focus-panel" aria-labelledby="focus-title">
          <div className="section-heading">
            <div><p className="eyebrow">НАЙБЛИЖЧІ 30 ДНІВ</p><h2 id="focus-title">У фокусі зараз</h2></div>
            <span>{focus.length} активних дій</span>
          </div>
          <div className="focus-grid">
            {focus.map((grant) => (
              <button key={grant.id} className="focus-item" onClick={() => reveal(grant.id)}>
                <span className={`mini-status ${grant.decision.toLowerCase()}`}>{grant.decision}</span>
                <strong>{grant.title}</strong><small>{grant.deadlineLabel}</small><p>{grant.nextAction}</p>
              </button>
            ))}
          </div>
        </section>

        <section className="workspace" aria-labelledby="workspace-title">
          <div className="section-heading">
            <div><p className="eyebrow">УСІ МОЖЛИВОСТІ</p><h2 id="workspace-title">Рішення ВАГ</h2></div>
            <span>{visible.length} із {items.length}</span>
          </div>
          <details className="method">
            <summary>Як розраховується відповідність 0–10</summary>
            <p>П’ять рівнозначних критеріїв по 0–2 бали: відповідність напряму ВАГ, право бути заявником, готовність партнерської мережі, реалістичність строку та співвідношення бюджету до складності.</p>
          </details>
          <details className="method data-source">
            <summary>Джерело автоматичного каталогу</summary>
            <p>Статус: <strong>{feedStatus === "live" ? "LIVE" : feedStatus === "loading" ? "оновлення…" : "fallback"}</strong>. Feed: <code>{feedUrl}</code></p>
            <p>Каталог перевіряється при відкритті сторінки та кожні 15 хвилин. Якщо зовнішній feed недоступний або має неправильну схему, Navigator зберігає останній вбудований безпечний каталог.</p>
          </details>
          <div className="toolbar">
            <label className="search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Пошук за грантом, ідеєю або дією…" aria-label="Пошук" /></label>
            <label><span>Рішення</span><select value={filter} onChange={(event) => setFilter(event.target.value as Decision | "ALL")}><option value="ALL">Усі рішення</option>{decisionKeys.map((key) => <option key={key} value={key}>{key} · {decisions[key].label}</option>)}</select></label>
            <label><span>Сортування</span><select value={sort} onChange={(event) => setSort(event.target.value as "deadline" | "score")}><option value="deadline">Найближчий дедлайн</option><option value="score">Найкраща відповідність</option></select></label>
          </div>

          <div className="grant-list">
            {visible.map((grant) => {
              const open = expanded === grant.id;
              return (
                <article className={`decision-card ${open ? "expanded" : ""}`} id={grant.id} key={grant.id}>
                  <div className="card-summary">
                    <div className="decision-cell">
                      <label className="visually-hidden" htmlFor={`decision-${grant.id}`}>Рішення для {grant.title}</label>
                      <select id={`decision-${grant.id}`} className={`decision-select ${grant.decision.toLowerCase()}`} value={grant.decision} onChange={(event) => updateDecision(grant.id, { decision: event.target.value as Decision })}>
                        {decisionKeys.map((key) => <option key={key} value={key}>{key}</option>)}
                      </select>
                      <small>{decisions[grant.decision].label}</small>
                    </div>
                    <div className="grant-identity"><p>{grant.organisation}</p><h3>{grant.title}</h3><div>{grant.topics.map((topic) => <span key={topic}>{topic}</span>)}</div></div>
                    <div className={`deadline-cell ${urgency(grant)}`}><small>Дедлайн</small><strong>{grant.deadlineLabel}</strong><span>внутрішній: {grant.internalDeadline}</span></div>
                    <div className="score-cell"><small>Відповідність</small><strong>{grant.score}<span>/10</span></strong><div><i style={{ width: `${grant.score * 10}%` }} /></div></div>
                    <button className="expand-button" aria-expanded={open} onClick={() => setExpanded(open ? null : grant.id)}>{open ? "Згорнути" : "Деталі"}<span aria-hidden="true">⌄</span></button>
                  </div>

                  {open && (
                    <div className="card-detail">
                      <div className="detail-main">
                        <div className="idea-block"><small>Проєктна ідея ВАГ</small><strong>{grant.idea}</strong><p>{grant.summary}</p></div>
                        <div className="action-grid">
                          <label><span>Наступна дія</span><textarea value={grant.nextAction} onChange={(event) => updateDecision(grant.id, { nextAction: event.target.value })} /></label>
                          <label><span>Відповідальна особа</span><input value={grant.owner} onChange={(event) => updateDecision(grant.id, { owner: event.target.value })} /></label>
                        </div>
                        <div className="risk"><span>Головний ризик</span><p>{grant.risk}</p></div>
                      </div>
                      <aside>
                        <div className="amount"><small>Фінансування</small><strong>{grant.amount}</strong><p>{grant.applicant}</p></div>
                        <div className="criteria"><small>Оцінка 0–2 за критерієм</small>{criteria.map((criterion, index) => <div key={criterion}><span>{criterion}</span><b>{grant.fit[index]}</b></div>)}</div>
                        <a href={grant.url} target="_blank" rel="noreferrer">Офіційні умови <span>↗</span></a>
                      </aside>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </div>

      <footer><strong>ВАГ · Панель грантових рішень</strong><p>Дані — для первинного управлінського рішення. Перед поданням звіряйте повні умови конкурсу.</p></footer>
    </main>
  );
}
