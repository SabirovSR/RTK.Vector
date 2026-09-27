import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  Plus,
  Search,
  ArrowUpRight,
  Pencil,
  Mail,
  Check,
  Download,
  RefreshCw,
  Network,
  BookOpen,
  Users,
  ChevronRight,
  SlidersHorizontal,
} from "lucide-react";
import type {
  User,
  University,
  Contact,
  Program,
  Task,
  Report,
  Job,
} from "./types";
import { Button } from "./components/ui/button";
import { Modal } from "./components/ui/dialog";
import {
  Badge,
  date,
  DealLink,
  Editor,
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
  useSave,
  type Field,
} from "./components/common";

const universityFields: Field[] = [
  { name: "name", label: "Название университета" },
  { name: "region", label: "Регион" },
  { name: "profile", label: "Профиль" },
  {
    name: "accreditation",
    label: "Аккредитация",
    type: "select",
    options: ["Действует", "Не указана", "Отсутствует"].map((x) => ({
      value: x,
      label: x,
    })),
  },
  { name: "requisites", label: "Реквизиты", type: "textarea", required: false },
  { name: "departments", label: "Кафедры", required: false },
  { name: "directions", label: "Направления", required: false },
];
const contactFields: Field[] = [
  { name: "name", label: "ФИО" },
  { name: "position", label: "Должность", required: false },
  { name: "email", label: "Email", type: "email" },
  { name: "phone", label: "Телефон", required: false },
];
export function UniversitiesPage({ user }: { user: User }) {
  const data = useData<University[]>("/universities"),
    [search, setSearch] = useState(""),
    [region, setRegion] = useState(""),
    [profile, setProfile] = useState(""),
    [accreditation, setAccreditation] = useState(""),
    [direction, setDirection] = useState(""),
    [editor, setEditor] = useState<University | "new" | null>(null),
    [selected, setSelected] = useState<University | null>(null),
    save = useSave();
  if (data.isLoading) return <Loading />;
  if (data.error) return <ErrorState error={data.error} />;
  const items = (data.data || []).filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) &&
      (!region || u.region === region) &&
      (!profile || u.profile === profile) &&
      (!accreditation || u.accreditation === accreditation) &&
      (u.details.directions || '').toLowerCase().includes(direction.toLowerCase()),
  );
  return (
    <>
      <PageTitle
        eyebrow="ПАРТНЁРСКАЯ СЕТЬ"
        title={user.role === "school" ? "Университеты" : "Мой университет"}
        description={
          user.role === "school"
            ? "Все партнёры и новые возможности для сотрудничества."
            : "Профиль вашего вуза и ответственные за сотрудничество."
        }
        action={
          user.role === "school" && (
            <Button onClick={() => setEditor("new")}>
              <Plus size={18} />
              Добавить вуз
            </Button>
          )
        }
      />
      <div className="filterbar">
        <div className="search-box">
          <Search size={18} />
          <input
            aria-label="Поиск университетов"
            placeholder="Найти университет…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          aria-label="Регион"
          value={region}
          onChange={(e) => setRegion(e.target.value)}
        >
          <option value="">Все регионы</option>
          {[...new Set(data.data?.map((u) => u.region))].map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <select
          aria-label="Профиль"
          value={profile}
          onChange={(e) => setProfile(e.target.value)}
        >
          <option value="">Все профили</option>
          {[...new Set(data.data?.map((u) => u.profile))].map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <select
          aria-label="Аккредитация"
          value={accreditation}
          onChange={(e) => setAccreditation(e.target.value)}
        >
          <option value="">Аккредитация</option>
          <option>Действует</option>
          <option>Не указана</option>
          <option>Отсутствует</option>
        </select>
        <input
          className="direction-search"
          aria-label="Направление"
          placeholder="Направление"
          value={direction}
          onChange={(e) => setDirection(e.target.value)}
        />
      </div>
      <div className="list-caption">Найдено университетов: {items.length}</div>
      <div className="university-grid">
        {items.map((u, i) => (
          <article className="university-card" key={u.id}>
            <div className="section-heading">
              <span className={"university-icon color-" + (i % 3)}>
                <Building2 size={26} />
              </span>
              <Badge
                value={u.accreditation === "Действует" ? "approved" : "none"}
              >
                {u.accreditation}
              </Badge>
            </div>
            <button
              className="card-title-button"
              onClick={() => setSelected(u)}
            >
              {u.name}
            </button>
            <p>
              {u.region} <span>·</span> {u.profile}
            </p>
            <div className="tags">
              {(u.details.directions || "Направления не указаны")
                .split(",")
                .map((x) => (
                  <span key={x}>{x.trim()}</span>
                ))}
            </div>
            <div className="card-bottom">
              <span>
                {u.editable ? "Ваше сотрудничество" : "Доступен для просмотра"}
              </span>
              <Button variant="ghost" size="sm" onClick={() => setSelected(u)}>
                Открыть <ArrowUpRight size={16} />
              </Button>
            </div>
          </article>
        ))}
      </div>
      {!items.length && (
        <Empty>
          Университеты не найдены. Измените фильтры или добавьте партнёра.
        </Empty>
      )}
      {editor && (
        <Editor
          title={
            editor === "new" ? "Новый университет" : "Профиль университета"
          }
          fields={universityFields}
          initial={
            editor === "new"
              ? {}
              : {
                  name: editor.name,
                  region: editor.region,
                  profile: editor.profile,
                  accreditation: editor.accreditation,
                  ...editor.details,
                }
          }
          onClose={() => setEditor(null)}
          onSave={async (v) => {
            const { requisites, departments, directions, ...main } = v;
            return save(
              editor === "new" ? "/universities" : "/universities/" + editor.id,
              editor === "new" ? "POST" : "PUT",
              { ...main, details: { requisites, departments, directions } },
            );
          }}
        />
      )}
      {selected && (
        <UniversityDetails
          university={
            (data.data || []).find((u) => u.id === selected.id) || selected
          }
          user={user}
          onClose={() => setSelected(null)}
          onEdit={() => {
            setEditor(selected);
            setSelected(null);
          }}
        />
      )}
    </>
  );
}
function UniversityDetails({
  university: u,
  user,
  onClose,
  onEdit,
}: {
  university: University;
  user: User;
  onClose: () => void;
  onEdit: () => void;
}) {
  const contacts = useData<Contact[]>("/universities/" + u.id + "/contacts"),
    [mode, setMode] = useState<"invite" | "contact" | null>(null),
    [editing, setEditing] = useState<Contact | null>(null),
    save = useSave();
  return (
    <Modal title={u.name} onClose={onClose}>
      <div className="detail-facts">
        <div>
          <small>Регион</small>
          <strong>{u.region}</strong>
        </div>
        <div>
          <small>Профиль</small>
          <strong>{u.profile}</strong>
        </div>
        <div>
          <small>Кафедры</small>
          <strong>{u.details.departments || "Не указаны"}</strong>
        </div>
        <div>
          <small>Реквизиты</small>
          <strong>{u.details.requisites || "Не указаны"}</strong>
        </div>
      </div>
      {u.editable && (
        <div className="button-row">
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil size={15} />
            Редактировать профиль
          </Button>
          {user.role === "school" && (
            <Button size="sm" onClick={() => setMode("invite")}>
              <Mail size={15} />
              Пригласить менеджера
            </Button>
          )}
        </div>
      )}
      <h3>Ответственные лица</h3>
      {contacts.error && <ErrorState error={contacts.error} />}
      <div>
        {contacts.data?.map((c) => (
          <div className="contact-row" key={c.id}>
            <span className="avatar">{c.name[0]}</span>
            <div>
              <strong>{c.name}</strong>
              <small>{c.position}</small>
              <small>
                {c.email} · {c.phone}
              </small>
            </div>
            {u.editable && (
              <button
                className="icon-button"
                aria-label="Редактировать контакт"
                onClick={() => setEditing(c)}
              >
                <Pencil size={15} />
              </button>
            )}
          </div>
        ))}
      </div>
      {u.editable && (
        <Button variant="outline" onClick={() => setMode("contact")}>
          <Plus size={16} />
          Добавить контакт
        </Button>
      )}
      {mode === "invite" && (
        <Editor
          title="Приглашение в кабинет вуза"
          fields={[
            { name: "email", label: "Email представителя", type: "email" },
          ]}
          submitLabel="Отправить приглашение"
          onClose={() => setMode(null)}
          onSave={(v) => save("/universities/" + u.id + "/invite", "POST", v)}
        />
      )}
      {(mode === "contact" || editing) && (
        <Editor
          title={editing ? "Редактировать контакт" : "Новый контакт"}
          fields={contactFields}
          initial={
            editing
              ? {
                  name: editing.name,
                  position: editing.position,
                  email: editing.email,
                  phone: editing.phone,
                }
              : {}
          }
          onClose={() => {
            setMode(null);
            setEditing(null);
          }}
          onSave={(v) =>
            save(
              editing
                ? "/contacts/" + editing.id
                : "/universities/" + u.id + "/contacts",
              editing ? "PUT" : "POST",
              v,
            )
          }
        />
      )}
    </Modal>
  );
}
export function ProgramsPage({ user }: { user: User }) {
  const data = useData<Program[]>("/programs"),
    [search, setSearch] = useState(""),
    [edit, setEdit] = useState(false),
    [vendors, setVendors] = useState(false),
    save = useSave();
  if (data.isLoading) return <Loading />;
  if (data.error) return <ErrorState error={data.error} />;
  return (
    <>
      <PageTitle
        eyebrow="ОБРАЗОВАТЕЛЬНАЯ ЭКОСИСТЕМА"
        title="Каталог программ"
        description="Практические компетенции для нового поколения ИТ-специалистов."
        action={
          user.role === "school" && (
            <div className="button-row">
              <Button variant="outline" onClick={() => setVendors(true)}>
                Вендоры
              </Button>
              <Button onClick={() => setEdit(true)}>
                <Plus size={17} />
                Новая программа
              </Button>
            </div>
          )
        }
      />
      <div className="filterbar">
        <div className="search-box">
          <Search size={18} />
          <input
            placeholder="Поиск по названию и направлению"
            aria-label="Поиск программ"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span className="muted">{data.data?.length} программ в каталоге</span>
      </div>
      <div className="program-grid">
        {data.data
          ?.filter((p) =>
            (p.name + p.direction).toLowerCase().includes(search.toLowerCase()),
          )
          .map((p, i) => (
            <article className="program-card" key={p.id}>
              <div className={"program-art art-" + (i % 3)}>
                <span>РТК / ОБРАЗОВАНИЕ</span>
                <BookOpen size={65} strokeWidth={1} />
                <small>0{i + 1}</small>
              </div>
              <div className="program-body">
                <span className="eyebrow">{p.direction}</span>
                <h2>{p.name}</h2>
                <p>{p.competencies}</p>
                <div className="tags">
                  <span>{p.tools}</span>
                </div>
                <Link className="text-link" to="/deals">
                  Перейти к сотрудничеству <ArrowUpRight size={16} />
                </Link>
              </div>
            </article>
          ))}
      </div>
      {edit && (
        <Editor
          title="Новая образовательная программа"
          fields={[
            { name: "name", label: "Название" },
            { name: "direction", label: "ИТ-направление" },
            { name: "competencies", label: "Компетенции", type: "textarea" },
            { name: "tools", label: "Цифровые инструменты" },
          ]}
          onClose={() => setEdit(false)}
          onSave={(v) => save("/programs", "POST", v)}
        />
      )}{" "}
      {vendors && <Vendors onClose={() => setVendors(false)} />}
    </>
  );
}
function Vendors({ onClose }: { onClose: () => void }) {
  const data =
    useData<
      Array<{
        id: number;
        company: string;
        product: string;
        contact: Record<string, string>;
      }>
    >("/vendors");
  return (
    <Modal title="Вендоры и цифровые инструменты" onClose={onClose}>
      {data.error && <ErrorState error={data.error} />}{" "}
      {data.data?.map((v) => (
        <div className="vendor-row" key={v.id}>
          <strong>{v.company}</strong>
          <p>{v.product}</p>
          <small>
            {v.contact.name} · {v.contact.email}
          </small>
        </div>
      ))}
      {data.data?.length === 0 && (
        <Empty>
          Загрузите справочник командой import-vendors из инструкции запуска.
        </Empty>
      )}
    </Modal>
  );
}
export function TasksPage({ user }: { user: User }) {
  const data = useData<Task[]>("/tasks"),
    action = useAction(),
    save = useSave(),
    [editing, setEditing] = useState<Task | null>(null),
    [filter, setFilter] = useState("mine");
  if (data.isLoading) return <Loading />;
  if (data.error) return <ErrorState error={data.error} />;
  const items = (data.data || []).filter(
    (t) =>
      filter === "team" ||
      (filter === "done"
        ? t.status === "done"
        : filter === "overdue"
          ? t.status === "open" && t.due < today()
          : t.status === "open" &&
            (user.role === "university" || t.owner_id === user.id)),
  );
  return (
    <>
      <PageTitle
        eyebrow="ОРГАНИЗАЦИЯ РАБОТЫ"
        title="Задачи"
        description="Следующий шаг всегда под рукой. Новые задачи создаются из карточки сотрудничества."
      />
      {action.notice}
      <div className="tabs">
        {[
          ["mine", "Мои открытые"],
          ["overdue", "Просроченные"],
          ["done", "Завершённые"],
          ...(user.role === "school" ? [["team", "Задачи команды"]] : []),
        ].map(([v, l]) => (
          <button
            className={filter === v ? "active" : ""}
            onClick={() => setFilter(v)}
            key={v}
          >
            {l}
          </button>
        ))}
      </div>
      <Section title={`${items.length} задач`}>
        {items.map((t) => (
          <div className="task-row" key={t.id}>
            <button
              className={"task-check " + (t.status === "done" ? "checked" : "")}
              aria-label={
                t.status === "done" ? "Вернуть задачу" : "Завершить задачу"
              }
              disabled={!t.editable || action.busy}
              onClick={() =>
                action.run("/tasks/" + t.id, "PATCH", {
                  status: t.status === "done" ? "open" : "done",
                })
              }
            >
              {t.status === "done" && <Check size={14} />}
            </button>
            <div>
              <strong>{t.title}</strong>
              {t.editable ? (
                <DealLink id={t.deal_id}>{t.deal_title}</DealLink>
              ) : (
                <small>{t.deal_title} · задача коллеги</small>
              )}
            </div>
            <Badge value={t.audience === "school" ? "none" : "approval"}>
              {t.audience === "school" ? "ИТ-школа" : "Вуз"}
            </Badge>
            <span
              className={
                t.due < today() && t.status === "open" ? "text-danger" : "muted"
              }
            >
              {date(t.due)}
            </span>
            {user.role === 'school' && t.editable && <button className="icon-button" aria-label="Редактировать задачу" onClick={() => setEditing(t)}><Pencil size={15}/></button>}
          </div>
        ))}
        {!items.length && <Empty>Здесь пока нет задач</Empty>}
      </Section>
      {editing && <Editor title="Редактировать задачу" fields={[
        {name:'title',label:'Что нужно сделать'},
        {name:'due',label:'Срок',type:'date'},
        {name:'audience',label:'Для кого',type:'select',options:[{value:'school',label:'ИТ-школа'},{value:'university',label:'Менеджер вуза'}]},
      ]} initial={{title:editing.title,due:editing.due,audience:editing.audience}} onClose={()=>setEditing(null)} onSave={v=>save('/tasks/'+editing.id,'PUT',v)}/>}
    </>
  );
}
export function ReportsPage() {
  const data = useData<Report>("/reports");
  if (data.isLoading) return <Loading />;
  if (data.error) return <ErrorState error={data.error} />;
  const r = data.data!;
  return (
    <>
      <PageTitle
        eyebrow="РЕЗУЛЬТАТЫ СОТРУДНИЧЕСТВА"
        title="Отчёты"
        description="Показатели по вашим сделкам. Без персональных данных обучающихся."
        action={
          <Button asChild variant="outline">
            <a href="/api/v1/reports/export">
              <Download size={17} />
              Выгрузить CSV
            </a>
          </Button>
        }
      />
      <div className="metric-grid">
        {[
          ["Всего сделок", r.total],
          ["Конверсия закрытых", r.conversion + "%"],
          ["Средний цикл", r.average_days + " дн."],
          ["Обучающиеся", r.students],
        ].map(([label, value]) => (
          <div className="metric-card" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>По вашему портфелю</small>
          </div>
        ))}
      </div>
      <div className="dashboard-columns">
        <Section title="Распределение по этапам">
          {Object.entries(stages).map(([key, label]) => (
            <div className="report-row" key={key}>
              <div>
                <span>{label}</span>
                <strong>{r.stages[key]}</strong>
              </div>
              <Progress value={r.total ? (r.stages[key] / r.total) * 100 : 0} />
            </div>
          ))}
        </Section>
        <Section title="Как считаются показатели">
          <div className="definition">
            <h3>Конверсия</h3>
            <p>
              {r.conversion_definition}. Открытые сделки не включаются в
              знаменатель.
            </p>
            <h3>Средний цикл</h3>
            <p>
              Количество дней от создания до закрытия. Учитываются завершённые
              сделки и отказы.
            </p>
            <h3>Просроченные задачи</h3>
            <p>
              <b>{r.overdue}</b> открытых задач со сроком раньше сегодняшнего
              дня.
            </p>
          </div>
        </Section>
      </div>
    </>
  );
}
export function IntegrationsPage() {
  const data = useData<Job[]>("/jobs"),
    action = useAction();
  return (
    <>
      <PageTitle
        eyebrow="ПОДКЛЮЧЕНИЯ"
        title="Интеграции"
        description="Прозрачная история фоновых операций и возможность повторить запрос."
      />
      {action.notice}
      <div className="integration-grid">
        <Section title="Почта">
          <Mail className="purple-text" size={30} />
          <p>Приглашения и уведомления доставляются в локальный Mailpit.</p>
          <a
            className="text-link"
            href="http://localhost:8025"
            target="_blank"
            rel="noreferrer"
          >
            Открыть Mailpit <ArrowUpRight size={15} />
          </a>
        </Section>
        <Section title="Учебная платформа">
          <BookOpen className="purple-text" size={30} />
          <p>
            Демонстрационная LMS. Синхронизация запускается в карточке группы.
          </p>
          <Badge value="changes">Демонстрационный адаптер</Badge>
        </Section>
        <Section title="Заявки с сайта">
          <Network className="purple-text" size={30} />
          <p>Приём заявок через API с сервисным ключом и защитой от дублей.</p>
          <a href="/api/v1/openapi.json" className="text-link">
            Контракт OpenAPI <ArrowUpRight size={15} />
          </a>
        </Section>
      </div>
      <Section
        title="Ваши фоновые операции"
        action={
          <Button variant="ghost" size="sm" onClick={() => data.refetch()}>
            <RefreshCw size={15} />
            Обновить
          </Button>
        }
      >
        {data.error && <ErrorState error={data.error} />}{" "}
        {data.data?.map((j) => (
          <div className="job-row" key={j.id}>
            <span className="job-icon">
              {j.kind === "lms" ? <BookOpen size={20} /> : <Mail size={20} />}
            </span>
            <div>
              <strong>
                {j.kind === "lms" ? "Синхронизация LMS" : "Отправка письма"}
              </strong>
              <small>
                {date(j.created_at)} · Попыток: {j.attempts}
              </small>
              {j.error && <p className="text-danger">{j.error}</p>}
            </div>
            <Badge value={j.status}>
              {j.status === "pending" ? "В очереди" : undefined}
            </Badge>
            {j.status === "failed" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => action.run("/jobs/" + j.id + "/retry", "POST")}
              >
                Повторить
              </Button>
            )}
          </div>
        ))}
        {data.data?.length === 0 && <Empty>Операций пока нет</Empty>}
      </Section>
    </>
  );
}
