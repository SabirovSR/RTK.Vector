import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Navigate,
  NavLink,
  Route,
  Routes,
  useNavigate,
  useSearchParams,
  Link,
} from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  GraduationCap,
  LayoutDashboard,
  Columns3,
  ListTodo,
  LibraryBig,
  ChartNoAxesCombined,
  Bell,
  LogOut,
  ChevronRight,
  HelpCircle,
  Network,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { api, setCsrf, type LoginInput } from "./api";
import type { User, Notification, Deal, Task } from "./types";
import { Button } from "./components/ui/button";
import {
  Badge,
  date,
  DealLink,
  Empty,
  ErrorState,
  Loading,
  PageTitle,
  Progress,
  Section,
  stages,
  today,
  useAction,
  useData,
} from "./components/common";
import { DealsPage, DealPage } from "./pages-deals";
import {
  UniversitiesPage,
  ProgramsPage,
  TasksPage,
  ReportsPage,
  IntegrationsPage,
} from "./pages-directory";

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <div className={"logo " + (light ? "logo-light" : "")}>
      <span className="logo-mark">
        <i />
        <i />
        <i />
      </span>
      <span>
        РТК <b>Вектор</b>
        <small>ИТ-ШКОЛА · ПРОСТРАНСТВО СОТРУДНИЧЕСТВА</small>
      </span>
    </div>
  );
}
export default function App() {
  const auth = useQuery({
    queryKey: ["auth"],
    queryFn: async () => {
      try {
        const result = await api<{ user: User; csrf: string }>("/auth/me");
        setCsrf(result.csrf);
        return result.user;
      } catch {
        return null;
      }
    },
    retry: false,
  });
  if (auth.isLoading) return <Loading />;
  return (
    <Routes>
      <Route
        path="/"
        element={
          auth.data ? <Navigate to="/dashboard" replace /> : <LoginPage />
        }
      />
      <Route path="/accept" element={<AcceptPage />} />
      <Route path="/admin" element={<Placeholder title="Администратор" />} />
      <Route
        path="/government"
        element={<Placeholder title="Сотрудник органов" />}
      />
      <Route
        path="/*"
        element={
          auth.data ? (
            <Workspace user={auth.data} />
          ) : (
            <Navigate to="/" replace />
          )
        }
      />
    </Routes>
  );
}
function LoginPage() {
  const [role, setRole] = useState<"school" | "university" | null>(null),
    [forgot, setForgot] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const client = useQueryClient(),
    navigate = useNavigate();
  return (
    <div className="login-page">
      <div className="login-story">
        <Logo light />
        <div className="login-story-content">
          <span className="pill-light">
            <span className="live-dot" />
            Единое пространство партнёрства
          </span>
          <h1>
            От первого контакта
            <br />
            до новых
            <br />
            <em>возможностей.</em>
          </h1>
          <p>
            Объединяем ИТ-школу и университеты,
            <br />
            чтобы вместе растить цифровые таланты.
          </p>
          <div className="orbit-art">
            <div className="orbit-ring ring-one" />
            <div className="orbit-ring ring-two" />
            <div className="orbit-ring ring-three" />
            <div className="art-node node-school">
              <GraduationCap />
              <span>ИТ-школа</span>
            </div>
            <div className="art-node node-uni">
              <Building2 />
              <span>Университет</span>
            </div>
            <div className="art-core">
              <Network size={36} />
            </div>
            <div className="art-tag">
              <span className="live-dot" />
              Движемся в одном направлении
            </div>
          </div>
        </div>
        <div className="login-footer">
          РТК Вектор <span>Образование, которое объединяет</span>
        </div>
      </div>
      <div className="login-form-side">
        <span className="top-label">CRM ДЛЯ ОБРАЗОВАТЕЛЬНЫХ ПАРТНЁРСТВ</span>
        <div className="login-form-content">
          <div className="small-brand">
            <Logo />
          </div>
          <div className="eyebrow">РАДЫ ВАС ВИДЕТЬ</div>
          <h2>
            {forgot
              ? "Восстановить доступ"
              : role
                ? "Вход в рабочее пространство"
                : "Вместе — к результату"}
          </h2>
          <p>
            {forgot
              ? "Отправим ссылку для смены пароля на вашу почту."
              : role
                ? "Введите данные вашей учётной записи."
                : "Выберите вашу сторону сотрудничества, чтобы войти в систему."}
          </p>
          {!role ? (
            <div className="role-options">
              <button className="role-card" onClick={() => setRole("school")}>
                <span className="role-icon">
                  <Network size={25} />
                </span>
                <span>
                  <strong>Менеджер ИТ-школы</strong>
                  <small>Партнёры, программы и развитие сотрудничества</small>
                </span>
                <ArrowRight size={21} />
              </button>
              <button
                className="role-card"
                onClick={() => setRole("university")}
              >
                <span className="role-icon orange">
                  <GraduationCap size={26} />
                </span>
                <span>
                  <strong>Менеджер вуза</strong>
                  <small>Программы, группы и результаты обучения</small>
                </span>
                <ArrowRight size={21} />
              </button>
            </div>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setError("");
                setBusy(true);
                const values = Object.fromEntries(
                  new FormData(e.currentTarget),
                );
                try {
                  if (forgot) {
                    const r = await api<{ message: string }>(
                      "/auth/forgot",
                      "POST",
                      { email: values.email },
                    );
                    setMessage(r.message);
                  } else {
                    const body: LoginInput = {
                      email: String(values.email),
                      password: String(values.password),
                      role,
                    };
                    const r = await api<{ user: User; csrf: string }>(
                      "/auth/login",
                      "POST",
                      body,
                    );
                    setCsrf(r.csrf);
                    client.removeQueries({
                      predicate: (q) => q.queryKey[0] !== "auth",
                    });
                    client.setQueryData(["auth"], r.user);
                    navigate("/dashboard");
                  }
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              <div className="selected-role">
                {role === "school" ? (
                  <Network size={19} />
                ) : (
                  <GraduationCap size={19} />
                )}{" "}
                {role === "school" ? "Менеджер ИТ-школы" : "Менеджер вуза"}
                <button
                  type="button"
                  onClick={() => {
                    setRole(null);
                    setForgot(false);
                    setError("");
                    setMessage("");
                  }}
                >
                  Изменить
                </button>
              </div>
              <label>
                Email
                <input
                  type="email"
                  name="email"
                  autoComplete="username"
                  placeholder="name@organization.ru"
                  required
                />
              </label>
              {!forgot && (
                <label>
                  Пароль
                  <input
                    type="password"
                    name="password"
                    autoComplete="current-password"
                    placeholder="Введите пароль"
                    required
                  />
                </label>
              )}
              {error && (
                <div className="notice error" role="alert">
                  {error}
                </div>
              )}
              {message && <div className="notice success">{message}</div>}
              <Button className="full-width" disabled={busy}>
                {busy ? "Подождите…" : forgot ? "Отправить ссылку" : "Войти"}
                <ArrowRight size={18} />
              </Button>
              <button
                className="link-button"
                type="button"
                onClick={() => {
                  setForgot(!forgot);
                  setMessage("");
                }}
              >
                {forgot ? "Вернуться ко входу" : "Забыли пароль?"}
              </button>
            </form>
          )}
          <div className="login-note">
            <ShieldCheck size={20} />
            <span>
              Доступ вуза — по приглашению менеджера ИТ-школы.
              <br />
              Все данные доступны только в рамках вашей роли.
            </span>
          </div>
          {import.meta.env.VITE_SHOW_DEMO_CREDENTIALS !== "false" && (
            <details className="demo-details">
              <summary>Демонстрационные аккаунты</summary>
              <p>
                После загрузки демоданных: <b>school@demo.test</b> или{" "}
                <b>university@demo.test</b>
                <br />
                Пароль: <code>VectorDemo2026!</code>
              </p>
            </details>
          )}
        </div>
        <div className="login-bottom">
          © 2026 РТК Вектор{" "}
          <span>
            Создаём будущее вместе <ArrowUpRight size={14} />
          </span>
        </div>
      </div>
    </div>
  );
}
function AcceptPage() {
  const [params] = useSearchParams(),
    action = useAction(),
    [done, setDone] = useState(false);
  return (
    <div className="standalone">
      <Logo />
      <Section title="Настройка доступа">
        {done ? (
          <>
            <p>Пароль сохранён. Теперь можно войти.</p>
            <Button asChild>
              <Link to="/">Перейти ко входу</Link>
            </Button>
          </>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const v = Object.fromEntries(new FormData(e.currentTarget));
              if (
                await action.run("/auth/accept", "POST", {
                  ...v,
                  token: params.get("token"),
                })
              )
                setDone(true);
            }}
          >
            <label>
              Ваше имя
              <input name="name" required minLength={2} />
            </label>
            <label>
              Новый пароль
              <input
                name="password"
                type="password"
                minLength={10}
                maxLength={128}
                required
                autoComplete="new-password"
              />
            </label>
            <p className="muted">Не менее 10 символов.</p>
            {action.notice}
            <Button disabled={action.busy}>Сохранить пароль</Button>
          </form>
        )}
      </Section>
    </div>
  );
}
function Placeholder({ title }: { title: string }) {
  return (
    <div className="standalone">
      <Logo />
      <Section title={title}>
        <Empty>
          Этот кабинет появится в следующей версии. Доступ к данным пока закрыт.
        </Empty>
        <Button asChild variant="outline">
          <Link to="/">На главную</Link>
        </Button>
      </Section>
    </div>
  );
}
function Workspace({ user }: { user: User }) {
  const navigate = useNavigate(),
    client = useQueryClient(),
    [showNotifications, setShowNotifications] = useState(false);
  const notifications = useData<Notification[]>("/notifications"),
    action = useAction();
  const school = user.role === "school";
  const nav = [
    { to: "/dashboard", icon: LayoutDashboard, label: "Обзор" },
    {
      to: "/universities",
      icon: Building2,
      label: school ? "Университеты" : "Мой университет",
    },
    {
      to: "/deals",
      icon: Columns3,
      label: school ? "Сотрудничество" : "Мои программы",
    },
    { to: "/tasks", icon: ListTodo, label: "Задачи" },
    { to: "/programs", icon: LibraryBig, label: "Каталог программ" },
    ...(school
      ? [{ to: "/reports", icon: ChartNoAxesCombined, label: "Отчёты" }]
      : []),
    { to: "/integrations", icon: Network, label: "Интеграции" },
  ];
  return (
    <div className="workspace">
      <aside className="sidebar">
        <Link to="/dashboard" className="brand-link">
          <Logo />
        </Link>
        <div className="workspace-switch">
          <span className="org-avatar">{school ? "РТ" : "ВУ"}</span>
          <span>
            <strong>
              {school ? "ИТ-школа Ростелеком" : "Кабинет университета"}
            </strong>
            <small>
              {school ? "Рабочее пространство" : "Образовательный партнёр"}
            </small>
          </span>
          <ChevronRight size={15} />
        </div>
        <div className="nav-label">РАБОЧЕЕ ПРОСТРАНСТВО</div>
        <nav>
          {nav.map((n) => (
            <NavLink key={n.to} to={n.to} aria-label={n.label} title={n.label}>
              <n.icon size={19} />
              <span>{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="demo-banner">
            <Sparkles size={18} />
            <strong>Демонстрационная среда</strong>
            <p>
              Синтетические данные.
              <br />
              Настоящие возможности.
            </p>
          </div>
          <a
            className="help-link"
            href="/api/v1/docs"
            onClick={(e) => {
              e.preventDefault();
              navigate("/integrations");
            }}
          >
            <HelpCircle size={17} />
            Сервисы и подключения
          </a>
          <div className="user-card">
            <span className="avatar">
              {user.name
                .split(" ")
                .map((x) => x[0])
                .slice(0, 2)
                .join("")}
            </span>
            <span>
              <strong>{user.name}</strong>
              <small>{school ? "Менеджер ИТ-школы" : "Менеджер вуза"}</small>
            </span>
            <button
              className="icon-button"
              aria-label="Выйти"
              onClick={async () => {
                await api("/auth/logout", "POST");
                setCsrf("");
                client.setQueryData(["auth"], null);
                client.removeQueries({
                  predicate: (q) => q.queryKey[0] !== "auth",
                });
                navigate("/");
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <span className="breadcrumb">
            Рабочее пространство <ChevronRight size={14} />{" "}
            <strong>РТК Вектор</strong>
          </span>
          <div className="topbar-actions">
            <span className="environment">
              <span className="live-dot" />
              Демо
            </span>
            <span className="topbar-date">
              {new Date().toLocaleDateString("ru-RU", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </span>
            <button
              className="notification-toggle icon-button"
              aria-label="Уведомления"
              onClick={() => setShowNotifications(!showNotifications)}
            >
              <Bell size={20} />
              {notifications.data?.some((n) => !n.read) && <i />}
            </button>
          </div>
        </header>
        {showNotifications && (
          <div className="notification-panel">
            <div className="section-heading">
              <h2>Уведомления</h2>
              <button
                className="link-button"
                onClick={() => setShowNotifications(false)}
              >
                Закрыть
              </button>
            </div>
            {notifications.data?.length ? (
              notifications.data.map((n) => (
                <button
                  key={n.id}
                  className={"notification-item " + (!n.read ? "unread" : "")}
                  onClick={async () => {
                    await action.run(
                      "/notifications/" + n.id + "/read",
                      "POST",
                    );
                    if (n.deal_id) navigate("/deals/" + n.deal_id);
                    setShowNotifications(false);
                  }}
                >
                  {n.text}
                  <small>{date(n.created_at)}</small>
                </button>
              ))
            ) : (
              <Empty>Новых уведомлений нет</Empty>
            )}
          </div>
        )}
        <main>
          <Routes>
            <Route path="/dashboard" element={<Dashboard user={user} />} />
            <Route
              path="/universities"
              element={<UniversitiesPage user={user} />}
            />
            <Route path="/deals" element={<DealsPage user={user} />} />
            <Route path="/deals/:id" element={<DealPage user={user} />} />
            <Route path="/tasks" element={<TasksPage user={user} />} />
            <Route path="/programs" element={<ProgramsPage user={user} />} />
            <Route
              path="/reports"
              element={school ? <ReportsPage /> : <Navigate to="/dashboard" />}
            />
            <Route path="/integrations" element={<IntegrationsPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
        <footer className="workspace-footer">
          РТК Вектор <span>У каждого партнёрства есть будущее.</span>
        </footer>
      </div>
    </div>
  );
}
function Dashboard({ user }: { user: User }) {
  const deals = useData<Deal[]>("/deals"),
    tasks = useData<Task[]>("/tasks");
  if (deals.isLoading || tasks.isLoading) return <Loading />;
  if (deals.error || tasks.error)
    return <ErrorState error={deals.error || tasks.error} />;
  const all = deals.data || [],
    mine = (tasks.data || []).filter(
      (t) => user.role === "university" || t.owner_id === user.id,
    ),
    open = mine.filter((t) => t.status === "open"),
    active = all.filter((d) => !["completed", "rejected"].includes(d.stage)),
    awaiting = all.filter((d) => d.proposal_status === "pending"),
    groups = all.flatMap((d) => d.groups),
    overdue = open.filter((t) => t.due < today());
  const metrics =
    user.role === "school"
      ? [
          ["Активные сотрудничества", active.length, "В работе прямо сейчас"],
          ["На согласовании", awaiting.length, "Ожидаем решение вуза"],
          [
            "Обучающиеся",
            groups.reduce((n, g) => n + g.students, 0),
            "В рамках ваших программ",
          ],
          ["Просроченные задачи", overdue.length, "Требуют вашего внимания"],
        ]
      : [
          ["Мои программы", active.length, "Активное сотрудничество"],
          ["Ждут вашего решения", awaiting.length, "Предложения ИТ-школы"],
          ["Учебные группы", groups.length, "В вашем университете"],
          [
            "Обучающиеся",
            groups.reduce((n, g) => n + g.students, 0),
            "В программах ИТ-школы",
          ],
        ];
  return (
    <>
      <PageTitle
        eyebrow="ВАШ РАБОЧИЙ ДЕНЬ"
        title={`Добрый день, ${user.name.split(" ")[0]}`}
        description="Всё важное для движения вперёд — в одном месте."
        action={
          <Button asChild>
            <Link to="/deals">
              {user.role === "school" ? "К сотрудничеству" : "Мои программы"}
              <ArrowRight size={17} />
            </Link>
          </Button>
        }
      />
      <div className="metric-grid">
        {metrics.map((m, i) => (
          <div className={"metric-card metric-" + i} key={String(m[0])}>
            <span>{m[0]}</span>
            <strong>
              {m[1]}
              <span className="metric-symbol">
                {i === 0 ? (
                  <Network size={23} />
                ) : i === 1 ? (
                  <Bell size={23} />
                ) : i === 2 ? (
                  <GraduationCap size={25} />
                ) : (
                  <ListTodo size={24} />
                )}
              </span>
            </strong>
            <small>{m[2]}</small>
          </div>
        ))}
      </div>
      <div className="dashboard-columns">
        <div>
          <Section
            title={
              user.role === "school"
                ? "Пульс сотрудничества"
                : "Программы вашего вуза"
            }
            action={
              <Link className="text-link" to="/deals">
                Все программы <ArrowUpRight size={15} />
              </Link>
            }
          >
            <div className="panel-caption">
              От первого контакта до результатов обучения
            </div>
            <div className="pipeline-chart">
              {Object.entries(stages)
                .filter(([s]) => s !== "rejected")
                .map(([key, label], i) => {
                  const count = all.filter((d) => d.stage === key).length;
                  return (
                    <div key={key} className="pipeline-column">
                      <span>{count}</span>
                      <div
                        style={{
                          height:
                            Math.max(
                              4,
                              (count /
                                Math.max(
                                  1,
                                  ...Object.keys(stages).map(
                                    (s) =>
                                      all.filter((d) => d.stage === s).length,
                                  ),
                                )) *
                                112,
                            ) + "px",
                          background: `hsl(${263 - i * 4} 58% ${43 + i * 4}%)`,
                        }}
                      />
                      <small>{label}</small>
                    </div>
                  );
                })}
            </div>
            <div className="panel-foot">
              <span>
                <i className="legend-dot" /> {all.length} сотрудничеств
              </span>
              <span>Обновляется по вашим данным</span>
            </div>
          </Section>
          <Section
            title="Ближайшие действия"
            action={
              <Link className="text-link" to="/tasks">
                Все задачи <ArrowUpRight size={15} />
              </Link>
            }
          >
            {open.length ? (
              open.slice(0, 5).map((t) => (
                <div className="task-row" key={t.id}>
                  <span
                    className={"task-dot " + (t.due < today() ? "overdue" : "")}
                  />
                  <div>
                    <DealLink id={t.deal_id}>{t.title}</DealLink>
                    <small>{t.deal_title}</small>
                  </div>
                  <span className={t.due < today() ? "text-danger" : "muted"}>
                    {date(t.due)}
                  </span>
                </div>
              ))
            ) : (
              <Empty>
                Все задачи выполнены. Можно планировать следующий шаг.
              </Empty>
            )}
          </Section>
        </div>
        <div>
          <div className="focus-card">
            <span className="focus-label">
              <span className="live-dot" />В ФОКУСЕ СЕГОДНЯ
            </span>
            <h2>
              {awaiting.length
                ? "Пора сделать следующий шаг"
                : "Развиваем партнёрства вместе"}
            </h2>
            <p>
              {awaiting.length
                ? `${awaiting.length} предложений программы ожидают согласования. Обсудите детали и двигайтесь к запуску.`
                : "Откройте сотрудничество, чтобы проверить сроки, договорённости и прогресс групп."}
            </p>
            <Link to={awaiting[0] ? "/deals/" + awaiting[0].id : "/deals"}>
              Посмотреть детали <ArrowRight size={18} />
            </Link>
            <div className="focus-decoration">↗</div>
          </div>
          <Section title="В работе">
            {active.slice(0, 4).map((d) => (
              <Link className="compact-deal" to={"/deals/" + d.id} key={d.id}>
                <div className="mini-university">
                  <Building2 size={18} />
                </div>
                <div>
                  <strong>{d.university_name}</strong>
                  <small>{d.program_name}</small>
                  <Badge value={d.stage} />
                </div>
                <ChevronRight size={16} />
              </Link>
            ))}
            {!active.length && <Empty>Активных программ пока нет</Empty>}
          </Section>
        </div>
      </div>
      {groups.some((g) => g.started) && (
        <Section title="Обучение в движении">
          <div className="group-overview">
            {groups
              .filter((g) => g.started)
              .map((g) => (
                <div key={g.id}>
                  <div className="section-heading">
                    <strong>{g.name}</strong>
                    <span className="purple-text">{g.progress}%</span>
                  </div>
                  <Progress value={g.progress} />
                  <small>
                    {g.students} студентов · {g.source}
                  </small>
                </div>
              ))}
          </div>
        </Section>
      )}
    </>
  );
}
