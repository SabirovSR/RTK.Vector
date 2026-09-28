import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  Columns3,
  FileText,
  GraduationCap,
  List,
  Mail,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Upload,
  Users,
  X,
} from "lucide-react";
import type {
  User,
  Deal,
  University,
  Program,
  Group,
  Participant,
  ImportPreview,
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
  initials,
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

export function DealsPage({ user }: { user: User }) {
  const data = useData<Deal[]>("/deals"),
    unis = useData<University[]>("/universities"),
    programs = useData<Program[]>("/programs"),
    [view, setView] = useState<"board" | "list">("board"),
    [search, setSearch] = useState(""),
    [stage, setStage] = useState(""),
    [uni, setUni] = useState(""),
    [program, setProgram] = useState(""),
    [deadline, setDeadline] = useState(""),
    [create, setCreate] = useState(false),
    save = useSave(),
    action = useAction(),
    navigate = useNavigate();
  if (data.isLoading) return <Loading />;
  if (data.error) return <ErrorState error={data.error} />;
  const items = (data.data || []).filter(
    (d) =>
      (d.title + d.university_name)
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (!stage || d.stage === stage) &&
      (!uni || String(d.university_id) === uni) &&
      (!program || String(d.program_id) === program) &&
      (!deadline || (d.deadline && d.deadline <= deadline)),
  );
  return (
    <>
      <PageTitle
        eyebrow="ОТ КОНТАКТА К РЕЗУЛЬТАТУ"
        title={user.role === "school" ? "Сотрудничество" : "Мои программы"}
        description={
          user.role === "school"
            ? "Путь каждого партнёрства: договорённости, запуск и развитие."
            : "Согласуйте программы, подготовьте группы и следите за результатами."
        }
        action={
          user.role === "school" && (
            <Button onClick={() => setCreate(true)}>
              <Plus size={18} />
              Новое сотрудничество
            </Button>
          )
        }
      />
      {action.notice}
      <div className="filterbar">
        <div className="search-box">
          <Search size={18} />
          <input
            aria-label="Поиск сотрудничества"
            placeholder="Найти сотрудничество…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          aria-label="Фильтр вуза"
          value={uni}
          onChange={(e) => setUni(e.target.value)}
        >
          <option value="">Все вузы</option>
          {unis.data?.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Фильтр программы"
          value={program}
          onChange={(e) => setProgram(e.target.value)}
        >
          <option value="">Все программы</option>
          {programs.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          aria-label="Фильтр этапа"
          value={stage}
          onChange={(e) => setStage(e.target.value)}
        >
          <option value="">Все этапы</option>
          {Object.entries(stages).map(([k, v]) => (
            <option value={k} key={k}>
              {v}
            </option>
          ))}
        </select>
        <input
          aria-label="Срок до"
          title="Срок до"
          type="date"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
        />
        <div className="view-toggle">
          <button
            aria-label="Канбан"
            className={view === "board" ? "active" : ""}
            onClick={() => setView("board")}
          >
            <Columns3 size={18} />
          </button>
          <button
            aria-label="Список"
            className={view === "list" ? "active" : ""}
            onClick={() => setView("list")}
          >
            <List size={18} />
          </button>
        </div>
      </div>
      <div className="list-caption">
        {items.length} сотрудничеств{" "}
        <span>
          {user.role === "school"
            ? "Перемещайте карточки по этапам или откройте подробности"
            : "Показаны только программы вашего вуза"}
        </span>
      </div>
      {view === "board" ? (
        <div className="kanban">
          {Object.entries(stages)
            .filter(([key]) => !stage || key === stage)
            .map(([key, label]) => (
              <section
                className={"kanban-column stage-" + key}
                key={key}
                onDragOver={(e) => e.preventDefault()}
                onDrop={async (e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/plain");
                  if (!id) return;
                  const deal = items.find((d) => d.id === Number(id));
                  if (!deal) return;
                  const order = Object.keys(stages);
                  let reason = "";
                  if (
                    key === "rejected" ||
                    order.indexOf(key) < order.indexOf(deal.stage)
                  ) {
                    const answer = window.prompt(
                      "Укажите причину отказа или возврата",
                    );
                    if (!answer) return;
                    reason = answer;
                  }
                  await action.run("/deals/" + id + "/transition", "POST", {
                    stage: key,
                    reason,
                  });
                }}
              >
                <header>
                  <span>
                    <i />
                    {label}
                  </span>
                  <b>{items.filter((d) => d.stage === key).length}</b>
                </header>
                <div className="kanban-cards">
                  {items
                    .filter((d) => d.stage === key)
                    .map((d) => (
                      <Link
                        to={"/deals/" + d.id}
                        className="deal-card"
                        key={d.id}
                        draggable={user.role === "school"}
                        onDragStart={(e) =>
                          e.dataTransfer.setData("text/plain", String(d.id))
                        }
                      >
                        <div className="deal-card-meta">
                          <span>ВЕКТОР-{String(d.id).padStart(3, "0")}</span>
                          <ArrowUpRight size={16} />
                        </div>
                        <h3>{d.title}</h3>
                        <div className="deal-university">
                          <Building2 size={15} />
                          {d.university_name}
                        </div>
                        <Badge value={d.proposal_status} />
                        <div className="deal-card-bottom">
                          <span>
                            <CalendarDays size={13} />
                            {date(d.deadline)}
                          </span>
                          <span>
                            <Users size={13} />
                            {d.groups.reduce((n, g) => n + g.students, 0)}
                          </span>
                          <span className="tiny-avatar">
                            {initials(user.name)}
                          </span>
                        </div>
                      </Link>
                    ))}
                  {!items.some((d) => d.stage === key) && (
                    <div className="kanban-empty">
                      Здесь появятся сотрудничества
                    </div>
                  )}
                </div>
              </section>
            ))}
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Сотрудничество</th>
                <th>Университет</th>
                <th>Этап</th>
                <th>Согласование</th>
                <th>Срок</th>
              </tr>
            </thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.id}>
                  <td>
                    <DealLink id={d.id}>{d.title}</DealLink>
                  </td>
                  <td>{d.university_name}</td>
                  <td>
                    <Badge value={d.stage} />
                  </td>
                  <td>
                    <Badge value={d.proposal_status} />
                  </td>
                  <td>{date(d.deadline)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {create && (
        <Editor
          title="Новое сотрудничество"
          fields={[
            { name: "title", label: "Название сотрудничества" },
            {
              name: "university_id",
              label: "Университет",
              type: "select",
              options: unis.data
                ?.filter((u) => u.editable)
                .map((u) => ({ value: u.id, label: u.name })),
            },
            {
              name: "program_id",
              label: "Программа",
              type: "select",
              options: programs.data?.map((p) => ({
                value: p.id,
                label: p.name,
              })),
            },
            {
              name: "deadline",
              label: "Плановый срок",
              type: "date",
              required: false,
            },
          ]}
          onClose={() => setCreate(false)}
          onSave={async (v) => {
            const d = await save<Deal>("/deals", "POST", {
              ...v,
              university_id: Number(v.university_id),
              program_id: Number(v.program_id),
            });
            navigate("/deals/" + d.id);
            return d;
          }}
        />
      )}
    </>
  );
}

const qualificationFields: Field[] = [
  { name: "contact", label: "Ответственное лицо / ЛПР" },
  { name: "interest", label: "Потребность и интерес", type: "textarea" },
  { name: "budget", label: "Бюджет и условия" },
  { name: "window", label: "Окно в учебном плане" },
];
const prepLabels: Record<string, string> = {
  materials: "Передача учебных материалов",
  licenses: "Передача лицензий и документации",
  teachers: "Обучение преподавателей",
  curriculum: "Актуализация учебной программы",
};
export function DealPage({ user }: { user: User }) {
  const { id } = useParams(),
    data = useData<Deal>("/deals/" + id),
    programs = useData<Program[]>("/programs"),
    [tab, setTab] = useState("overview"),
    [editor, setEditor] = useState(""),
    [group, setGroup] = useState<Group | null>(null),
    [expansionId, setExpansionId] = useState<number | null>(null),
    action = useAction(),
    save = useSave(),
    navigate = useNavigate();
  if (data.isLoading) return <Loading />;
  if (data.error) return <ErrorState error={data.error} />;
  const d = data.data!,
    school = user.role === "school",
    base = "/deals/" + d.id,
    proposal = d.proposals?.[0],
    closed = ["completed", "rejected"].includes(d.stage);
  const next = Object.keys(stages)[Object.keys(stages).indexOf(d.stage) + 1];
  const editValues = {
    title: d.title,
    deadline: d.deadline,
    qualification: d.qualification || {},
    preparation: d.preparation,
    notes: d.notes || "",
  };
  return (
    <>
      <Link className="back-link" to="/deals">
        <ArrowLeft size={15} />
        Все сотрудничества
      </Link>
      <PageTitle
        eyebrow={`ВЕКТОР-${String(d.id).padStart(3, "0")} · ${d.university_name}`}
        title={d.title}
        description={d.program_name}
        action={
          school && (
            <Button variant="outline" onClick={() => setEditor("transition")}>
              Изменить этап <ArrowRight size={17} />
            </Button>
          )
        }
      />
      <div className="deal-meta-bar">
        <Badge value={d.stage} />
        <span>
          <Building2 size={16} />
          {d.university_name}
        </span>
        <span>
          <CalendarDays size={16} />
          Срок: {date(d.deadline)}
        </span>
        {d.parent_id && (
          <Link to={"/deals/" + d.parent_id}>Продолжение #{d.parent_id}</Link>
        )}
      </div>
      {action.notice}
      <div className="stage-track">
        {Object.entries(stages)
          .filter(([k]) => k !== "rejected")
          .map(([key, label], i) => (
            <div
              key={key}
              className={
                key === d.stage
                  ? "current"
                  : i < Object.keys(stages).indexOf(d.stage) &&
                      d.stage !== "rejected"
                    ? "passed"
                    : ""
              }
            >
              <span>
                {i < Object.keys(stages).indexOf(d.stage) &&
                d.stage !== "rejected" ? (
                  <Check size={12} />
                ) : (
                  i + 1
                )}
              </span>
              {label}
            </div>
          ))}
      </div>
      <div className="tabs">
        {[
          ["overview", "Обзор"],
          ["program", "Программа и согласование"],
          ["documents", "Документы"],
          ["groups", "Группы и обучение"],
          ["activity", "История и задачи"],
        ].map(([key, label]) => (
          <button
            key={key}
            className={tab === key ? "active" : ""}
            onClick={() => setTab(key)}
          >
            {label}
            {key === "documents" && <small>{d.documents?.length}</small>}
            {key === "groups" && <small>{d.groups.length}</small>}
          </button>
        ))}
      </div>
      {tab === "overview" && (
        <div className="dashboard-columns">
          <div>
            <Section title="Следующий шаг">
              <div className="next-step">
                <div className="role-icon">
                  <ArrowRight size={23} />
                </div>
                <div>
                  <h3>
                    {d.stage === "approval"
                      ? "Согласуйте образовательную программу"
                      : d.stage === "preparation"
                        ? "Подготовьте программу к запуску"
                        : d.stage === "training"
                          ? "Следите за ходом обучения"
                          : closed
                            ? "Подведите итоги и обсудите продолжение"
                            : "Двигайтесь по этапам сотрудничества"}
                  </h3>
                  <p>
                    {d.stage === "approval"
                      ? "Вуз может принять предложение или отправить замечания к текущей версии."
                      : "Проверяйте документы, договорённости и задачи в соответствующих разделах."}
                  </p>
                </div>
              </div>
              <div className="button-row">
                <Button
                  variant="outline"
                  onClick={() =>
                    setTab(d.stage === "training" ? "groups" : "program")
                  }
                >
                  {d.stage === "training"
                    ? "Открыть группы"
                    : "Открыть программу"}
                  <ArrowUpRight size={16} />
                </Button>
                {school && !closed && next && next !== "rejected" && (
                  <Button
                    disabled={action.busy}
                    onClick={() =>
                      action.run(base + "/transition", "POST", {
                        stage: next,
                        reason: "",
                      })
                    }
                  >
                    Перейти: {stages[next]}
                    <ArrowRight size={16} />
                  </Button>
                )}
              </div>
            </Section>
            {school && (
              <Section
                title="Квалификация сотрудничества"
                action={
                  !closed && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditor("qualification")}
                    >
                      <Pencil size={14} />
                      Изменить
                    </Button>
                  )
                }
              >
                <div className="detail-facts">
                  {qualificationFields.map((f) => (
                    <div key={f.name}>
                      <small>{f.label}</small>
                      <strong>
                        {d.qualification?.[f.name] || "Не заполнено"}
                      </strong>
                    </div>
                  ))}
                </div>
              </Section>
            )}
            <Section title="Готовность к запуску">
              {Object.entries(prepLabels).map(([key, label]) => (
                <div className="checklist-row" key={key}>
                  <span
                    className={
                      "check-circle " + (d.preparation[key] ? "complete" : "")
                    }
                  >
                    {d.preparation[key] ? <Check size={14} /> : null}
                  </span>
                  <div>
                    <strong>{label}</strong>
                    {d.preparation[key]?.startsWith("na:") && (
                      <small>Не требуется: {d.preparation[key].slice(3)}</small>
                    )}
                  </div>
                  {school && !closed && (
                    <button
                      className="link-button"
                      onClick={() => setEditor("prep:" + key)}
                    >
                      {d.preparation[key] ? "Изменить" : "Отметить"}
                    </button>
                  )}
                </div>
              ))}
              <div className="checklist-row">
                <span
                  className={
                    "check-circle " +
                    (d.documents?.some((x) => x.kind === "signed_contract")
                      ? "complete"
                      : "")
                  }
                >
                  <FileText size={13} />
                </span>
                <strong>Подписанный договор</strong>
                <button
                  className="link-button"
                  onClick={() => setTab("documents")}
                >
                  Документы
                </button>
              </div>
              <div className="checklist-row">
                <span
                  className={
                    "check-circle " +
                    (d.groups.length && d.groups.every((g) => g.confirmed)
                      ? "complete"
                      : "")
                  }
                >
                  <Users size={13} />
                </span>
                <strong>Подтверждённые списки групп</strong>
                <button
                  className="link-button"
                  onClick={() => setTab("groups")}
                >
                  Группы
                </button>
              </div>
            </Section>
          </div>
          <div>
            <Section
              title="О сотрудничестве"
              action={
                school &&
                !closed && (
                  <button
                    className="icon-button"
                    aria-label="Редактировать сделку"
                    onClick={() => setEditor("details")}
                  >
                    <Pencil size={16} />
                  </button>
                )
              }
            >
              <div className="detail-stack">
                <div>
                  <small>Программа</small>
                  <strong>{d.program_name}</strong>
                </div>
                <div>
                  <small>Дата создания</small>
                  <strong>{date(d.created_at)}</strong>
                </div>
                <div>
                  <small>Согласование</small>
                  <Badge value={d.proposal_status} />
                </div>
                <div>
                  <small>Учебные группы</small>
                  <strong>
                    {d.groups.length} групп ·{" "}
                    {d.groups.reduce((n, g) => n + g.students, 0)} студентов
                  </strong>
                </div>
                {school && (
                  <div>
                    <small>Внутренние заметки</small>
                    <p>{d.notes || "Заметок пока нет"}</p>
                  </div>
                )}
              </div>
            </Section>
            <Section title="Развитие партнёрства">
              <p className="muted">
                Новая программа или дополнительная группа — следующий шаг в
                сотрудничестве.
              </p>
              {!school && (
                <Button
                  variant="outline"
                  onClick={() => setEditor("expansion")}
                >
                  <Plus size={16} />
                  Запросить продолжение
                </Button>
              )}
              {d.expansions?.map((e) => (
                <div className="expansion-card" key={e.id}>
                  <p>{e.text}</p>
                  <Badge value={e.status} />
                  {school && e.status === "pending" && (
                    <Button size="sm" onClick={() => setExpansionId(e.id)}>
                      Создать сотрудничество
                    </Button>
                  )}
                  {e.new_deal_id && (
                    <DealLink id={e.new_deal_id}>Открыть продолжение</DealLink>
                  )}
                </div>
              ))}
              {!school && ["evaluation", "completed"].includes(d.stage) && (
                <Button
                  className="mt"
                  variant="outline"
                  onClick={() => setEditor("feedback")}
                >
                  <MessageSquare size={15} />
                  Оставить отзыв
                </Button>
              )}
            </Section>
          </div>
        </div>
      )}
      {tab === "program" && (
        <div className="dashboard-columns">
          <Section
            title="Предложение программы"
            action={
              school &&
              ["new", "qualification", "approval"].includes(d.stage) && (
                <Button size="sm" onClick={() => setEditor("proposal")}>
                  <Plus size={15} />
                  Новая версия
                </Button>
              )
            }
          >
            {proposal ? (
              <>
                <div className="proposal-top">
                  <span>Версия {proposal.version}</span>
                  <Badge value={proposal.status} />
                </div>
                {!school && proposal.status === "approved" ? (
                  <p className="muted">
                    {["new", "qualification", "approval"].includes(d.stage)
                      ? "Программа согласована и снята со страницы согласования."
                      : "Программа согласована и передана дальше по цепочке сотрудничества."}
                  </p>
                ) : (
                  <>
                    <div className="proposal-content">{proposal.content}</div>
                    {proposal.comment && (
                      <blockquote>{proposal.comment}</blockquote>
                    )}
                    {!school &&
                      proposal.status === "pending" &&
                      ["new", "qualification", "approval"].includes(
                        d.stage,
                      ) && (
                        <div className="button-row">
                          <Button
                            disabled={action.busy}
                            onClick={() =>
                              action.run(
                                "/proposals/" + proposal.id + "/decision",
                                "POST",
                                { status: "approved", comment: "" },
                              )
                            }
                          >
                            <Check size={16} />
                            Согласовать
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => setEditor("decision")}
                          >
                            Отправить замечания
                          </Button>
                        </div>
                      )}
                  </>
                )}
              </>
            ) : (
              <Empty>
                Менеджер ИТ-школы ещё не опубликовал предложение программы.
              </Empty>
            )}
          </Section>
          <Section title="История версий">
            {d.proposals?.map((p) => (
              <details className="version-item" key={p.id}>
                <summary>
                  <FileText size={17} />
                  Версия {p.version}
                  <Badge value={p.status} />
                </summary>
                {(school || p.status !== "approved") && (
                  <p className="pre-wrap">{p.content}</p>
                )}
                {p.comment && <blockquote>{p.comment}</blockquote>}
              </details>
            ))}
          </Section>
          <Section
            title="Обсуждение"
            className="span-all"
            action={
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditor("comment")}
              >
                <MessageSquare size={15} />
                Написать комментарий
              </Button>
            }
          >
            {d.activities
              ?.filter((a) =>
                ["comment", "decision", "feedback"].includes(a.kind),
              )
              .map((a) => (
                <div className="timeline-item" key={a.id}>
                  <span className="timeline-dot" />
                  <div>
                    <small>{date(a.created_at)}</small>
                    <p>{a.text}</p>
                  </div>
                </div>
              ))}
          </Section>
        </div>
      )}
      {tab === "documents" && (
        <Section
          title="Документы сотрудничества"
          action={
            <Button onClick={() => setEditor("upload")}>
              <Upload size={17} />
              Загрузить документ
            </Button>
          }
        >
          <p className="panel-caption">
            PDF, DOCX и XLSX до 20 МБ. Подписанный договор — загруженный файл,
            без электронной подписи.
          </p>
          {d.documents?.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Документ</th>
                    <th>Тип</th>
                    <th>Версия</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {d.documents.map((doc) => (
                    <tr key={doc.id}>
                      <td>
                        <span className="file-name">
                          <FileText size={18} />
                          {doc.name}
                        </span>
                      </td>
                      <td>
                        {
                          {
                            material: "Материал",
                            contract: "Договор",
                            signed_contract: "Подписанный договор",
                          }[doc.kind]
                        }
                      </td>
                      <td>{doc.version}</td>
                      <td>
                        <a
                          className="text-link"
                          href={"/api/v1/documents/" + doc.id + "/download"}
                        >
                          Скачать <ArrowUpRight size={15} />
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>Документов пока нет. Загрузите первую версию.</Empty>
          )}
        </Section>
      )}
      {tab === "groups" && (
        <>
          <Section
            title="Учебные группы"
            action={
              !["training", "evaluation", "completed", "rejected"].includes(
                d.stage,
              ) && (
                <Button onClick={() => setEditor("group")}>
                  <Plus size={17} />
                  Создать группу
                </Button>
              )
            }
          >
            <p className="panel-caption">
              Прогресс и результаты поступают из демонстрационной LMS. Состав
              группы после запуска обучения заблокирован.
            </p>
            <div className="group-grid">
              {d.groups.map((g) => (
                <article className="group-card" key={g.id}>
                  <div className="section-heading">
                    <span className="role-icon orange">
                      <GraduationCap size={23} />
                    </span>
                    <Badge
                      value={
                        g.started
                          ? "training"
                          : g.confirmed
                            ? "approved"
                            : "pending"
                      }
                    >
                      {g.started
                        ? "Обучение запущено"
                        : g.confirmed
                          ? "Списки подтверждены"
                          : "Подготовка списка"}
                    </Badge>
                  </div>
                  <h3>{g.name}</h3>
                  <div className="group-numbers">
                    <span>
                      <strong>{g.students}</strong>студентов
                    </span>
                    <span>
                      <strong>{g.progress}%</strong>прогресс
                    </span>
                    <span>
                      <strong>{g.attendance}%</strong>посещаемость
                    </span>
                  </div>
                  <Progress value={g.progress} />
                  <div className="button-row">
                    {!school && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setGroup(g)}
                      >
                        <Users size={15} />
                        Участники и результаты
                      </Button>
                    )}
                    {g.started && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={action.busy}
                        onClick={() =>
                          action.run("/groups/" + g.id + "/sync", "POST")
                        }
                      >
                        <RefreshCw size={15} />
                        Синхронизировать
                      </Button>
                    )}
                  </div>
                  <small className="muted">{g.source}</small>
                </article>
              ))}
            </div>
            {!d.groups.length && (
              <Empty>Создайте группу, чтобы начать подготовку списков.</Empty>
            )}
          </Section>
          {school && (
            <div className="privacy-note">
              <Users size={19} />
              Персональные данные участников доступны только менеджеру вуза.
              Здесь показана агрегированная статистика.
            </div>
          )}
        </>
      )}
      {tab === "activity" && (
        <div className="dashboard-columns">
          <Section
            title="История взаимодействия"
            action={
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditor(school ? "communication" : "comment")}
              >
                <Plus size={16} />
                {school ? "Зафиксировать касание" : "Комментарий"}
              </Button>
            }
          >
            {d.activities?.length ? (
              d.activities.map((a) => (
                <div className="timeline-item" key={a.id}>
                  <span className="timeline-dot" />
                  <div>
                    <small>
                      {date(a.created_at)} ·{" "}
                      {a.shared ? "Совместная история" : "Внутренняя запись"}
                    </small>
                    <p>{a.text}</p>
                  </div>
                </div>
              ))
            ) : (
              <Empty>Здесь будет история договорённостей</Empty>
            )}
          </Section>
          <Section
            title="Задачи"
            action={
              school && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditor("task")}
                >
                  <Plus size={16} />
                  Добавить
                </Button>
              )
            }
          >
            {d.tasks?.map((t) => (
              <div className="task-row" key={t.id}>
                <button
                  type="button"
                  className={
                    "task-check " + (t.status === "done" ? "checked" : "")
                  }
                  aria-label="Изменить статус задачи"
                  disabled={action.busy}
                  onClick={() =>
                    action.run("/tasks/" + t.id, "PATCH", {
                      status: t.status === "done" ? "open" : "done",
                    })
                  }
                >
                  {t.status === "done" && <Check size={13} />}
                </button>
                <div>
                  <strong>{t.title}</strong>
                  <small>
                    {t.audience === "school" ? "ИТ-школа" : "Вуз"} ·{" "}
                    {date(t.due)}
                  </small>
                </div>
              </div>
            ))}
          </Section>
        </div>
      )}
      {editor === "transition" && (
        <Editor
          title="Изменить этап сотрудничества"
          fields={[
            {
              name: "stage",
              label: "Новый этап",
              type: "select",
              options: Object.entries(stages)
                .filter(([k]) => k !== d.stage)
                .map(([value, label]) => ({ value, label })),
            },
            {
              name: "reason",
              label: "Причина возврата или отказа",
              type: "textarea",
              required: false,
            },
          ]}
          initial={{ stage: next === "rejected" ? "completed" : next || "new" }}
          onClose={() => setEditor("")}
          onSave={(v) => save(base + "/transition", "POST", v)}
        />
      )}
      {editor === "qualification" && (
        <Editor
          title="Квалификация сотрудничества"
          fields={qualificationFields}
          initial={d.qualification}
          onClose={() => setEditor("")}
          onSave={(v) => save(base, "PUT", { ...editValues, qualification: v })}
        />
      )}
      {editor === "details" && (
        <Editor
          title="Параметры сотрудничества"
          fields={[
            { name: "title", label: "Название" },
            {
              name: "deadline",
              label: "Плановый срок",
              type: "date",
              required: false,
            },
            {
              name: "notes",
              label: "Внутренние заметки",
              type: "textarea",
              required: false,
            },
          ]}
          initial={{
            title: d.title,
            deadline: d.deadline,
            notes: d.notes || "",
          }}
          onClose={() => setEditor("")}
          onSave={(v) => save(base, "PUT", { ...editValues, ...v })}
        />
      )}
      {editor.startsWith("prep:") && (
        <Editor
          title={prepLabels[editor.split(":")[1]]}
          fields={[
            {
              name: "status",
              label: "Состояние",
              type: "select",
              options: [
                { value: "done", label: "Выполнено" },
                { value: "na", label: "Не требуется" },
                { value: "", label: "Не выполнено" },
              ],
            },
            {
              name: "reason",
              label: "Объяснение, если не требуется",
              required: false,
            },
          ]}
          onClose={() => setEditor("")}
          onSave={(v) => {
            if (v.status === "na" && v.reason.trim().length < 3)
              throw new Error("Объясните, почему пункт не требуется");
            return save(base, "PUT", {
              ...editValues,
              preparation: {
                ...d.preparation,
                [editor.split(":")[1]]:
                  v.status === "na" ? "na:" + v.reason : v.status,
              },
            });
          }}
        />
      )}
      {editor === "proposal" && (
        <Editor
          title="Новая версия предложения"
          fields={[
            {
              name: "content",
              label: "Содержание программы, компетенции и инструменты",
              type: "textarea",
            },
          ]}
          initial={{ content: proposal?.content || "" }}
          submitLabel="Опубликовать для согласования"
          onClose={() => setEditor("")}
          onSave={(v) => save(base + "/proposals", "POST", v)}
        />
      )}
      {editor === "decision" && proposal && (
        <Editor
          title="Решение по программе"
          fields={[
            {
              name: "status",
              label: "Решение",
              type: "select",
              options: [
                { value: "changes", label: "Запросить изменения" },
                { value: "rejected", label: "Отклонить предложение" },
              ],
            },
            { name: "comment", label: "Комментарий", type: "textarea" },
          ]}
          onClose={() => setEditor("")}
          onSave={(v) =>
            save("/proposals/" + proposal.id + "/decision", "POST", v)
          }
        />
      )}
      {["comment", "expansion", "feedback"].includes(editor) && (
        <Editor
          title={
            editor === "comment"
              ? "Новый комментарий"
              : editor === "expansion"
                ? "Запрос на продолжение"
                : "Обратная связь по программе"
          }
          fields={[
            {
              name: "text",
              label:
                editor === "expansion"
                  ? "Какая программа или группа вам нужна?"
                  : "Ваше сообщение",
              type: "textarea",
            },
          ]}
          onClose={() => setEditor("")}
          onSave={(v) =>
            save(
              base +
                "/" +
                {
                  comment: "comments",
                  expansion: "expansions",
                  feedback: "feedback",
                }[editor],
              "POST",
              v,
            )
          }
        />
      )}
      {editor === "group" && (
        <Editor
          title="Новая учебная группа"
          fields={[{ name: "name", label: "Название группы" }]}
          onClose={() => setEditor("")}
          onSave={(v) => save(base + "/groups", "POST", v)}
        />
      )}
      {editor === "task" && (
        <Editor
          title="Следующая задача"
          fields={[
            { name: "title", label: "Что нужно сделать" },
            { name: "due", label: "Срок", type: "date" },
            {
              name: "audience",
              label: "Для кого",
              type: "select",
              options: [
                { value: "school", label: "ИТ-школа" },
                { value: "university", label: "Менеджер вуза" },
              ],
            },
          ]}
          initial={{ due: today() }}
          onClose={() => setEditor("")}
          onSave={(v) => save(base + "/tasks", "POST", v)}
        />
      )}
      {editor === "communication" && (
        <Editor
          title="Зафиксировать касание"
          fields={[
            {
              name: "kind",
              label: "Канал",
              type: "select",
              options: [
                { value: "call", label: "Звонок" },
                { value: "meeting", label: "Встреча" },
                { value: "message", label: "Сообщение" },
                { value: "email", label: "Отправить email" },
              ],
            },
            { name: "text", label: "Содержание / результат", type: "textarea" },
            {
              name: "recipient",
              label: "Email получателя (для отправки)",
              type: "email",
              required: false,
            },
            { name: "title", label: "Следующее действие" },
            { name: "due", label: "Срок следующего действия", type: "date" },
          ]}
          initial={{
            due: today(),
            text: `Добрый день! Предлагаем обсудить программу «${d.program_name}» для вашего университета. Подскажите удобное время для встречи.`,
          }}
          onClose={() => setEditor("")}
          onSave={(v) =>
            save(base + "/communications", "POST", {
              ...v,
              recipient: v.recipient || null,
            })
          }
        />
      )}
      {editor === "upload" && (
        <UploadDocument dealId={d.id} onClose={() => setEditor("")} />
      )}
      {group && (
        <GroupDetails
          group={d.groups.find((g) => g.id === group.id) || group}
          onClose={() => setGroup(null)}
        />
      )}
      {expansionId && (
        <Editor
          title="Продолжение сотрудничества"
          fields={[
            { name: "title", label: "Название нового сотрудничества" },
            {
              name: "program_id",
              label: "Программа",
              type: "select",
              options: programs.data?.map((p) => ({
                value: p.id,
                label: p.name,
              })),
            },
          ]}
          initial={{
            title: d.title + " · продолжение",
            program_id: d.program_id,
          }}
          onClose={() => setExpansionId(null)}
          onSave={async (v) => {
            const next = await save<Deal>(
              "/expansions/" + expansionId + "/accept",
              "POST",
              { ...v, program_id: Number(v.program_id) },
            );
            navigate("/deals/" + next.id);
            setTab("overview");
            return next;
          }}
        />
      )}
    </>
  );
}
function UploadDocument({
  dealId,
  onClose,
}: {
  dealId: number;
  onClose: () => void;
}) {
  const action = useAction();
  return (
    <Modal title="Загрузить документ" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            await action.run(
              "/deals/" + dealId + "/documents",
              "POST",
              new FormData(e.currentTarget),
            )
          )
            onClose();
        }}
      >
        <label>
          Тип документа
          <select name="kind">
            <option value="material">Учебный материал</option>
            <option value="contract">Договор на согласование</option>
            <option value="signed_contract">Подписанный договор</option>
          </select>
        </label>
        <label className="upload-zone">
          <Upload size={28} />
          <strong>Выберите документ</strong>
          <span>PDF, DOCX или XLSX · до 20 МБ</span>
          <input type="file" name="file" accept=".pdf,.docx,.xlsx" required />
        </label>
        {action.notice}
        <div className="form-actions">
          <Button disabled={action.busy}>Загрузить</Button>
        </div>
      </form>
    </Modal>
  );
}
const participantFields: Field[] = [
  { name: "name", label: "ФИО" },
  { name: "email", label: "Email", type: "email" },
  { name: "phone", label: "Телефон", required: false },
  {
    name: "kind",
    label: "Участие",
    type: "select",
    options: [
      { value: "student", label: "Студент" },
      { value: "teacher", label: "Преподаватель" },
    ],
  },
];
function GroupDetails({
  group: g,
  onClose,
}: {
  group: Group;
  onClose: () => void;
}) {
  const data = useData<Participant[]>("/groups/" + g.id + "/participants"),
    [editor, setEditor] = useState<Participant | "new" | null>(null),
    [importing, setImporting] = useState(false),
    save = useSave(),
    action = useAction();
  return (
    <Modal title={g.name} onClose={onClose}>
      <div className="section-heading">
        <Badge
          value={g.started ? "training" : g.confirmed ? "approved" : "pending"}
        >
          {g.started
            ? "Состав заблокирован"
            : g.confirmed
              ? "Список подтверждён"
              : "Список в подготовке"}
        </Badge>
        <span className="muted">Демонстрационная LMS</span>
      </div>
      {action.notice}
      {data.error && <ErrorState error={data.error} />}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Участник</th>
              <th>Прогресс</th>
              <th>Результат</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.data?.map((p) => (
              <tr key={p.id}>
                <td>
                  <strong>{p.name}</strong>
                  <small>{p.email}</small>
                  <small>
                    {p.kind === "teacher" ? "Преподаватель" : "Студент"}
                  </small>
                </td>
                <td>
                  {p.result ? (
                    <>
                      {p.result.progress}%
                      <small>Посещаемость {p.result.attendance}%</small>
                    </>
                  ) : (
                    "Нет данных"
                  )}
                </td>
                <td>{p.result ? p.result.score + " / 100" : "—"}</td>
                <td>
                  {!g.started && (
                    <button
                      className="icon-button"
                      aria-label="Редактировать участника"
                      onClick={() => setEditor(p)}
                    >
                      <Pencil size={15} />
                    </button>
                  )}
                  {p.result?.progress === 100 && p.result.score >= 60 && (
                    <a
                      className="text-link"
                      href={"/api/v1/participants/" + p.id + "/certificate"}
                    >
                      Сертификат
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!data.data?.length && (
        <Empty>Добавьте участников вручную или загрузите список</Empty>
      )}
      {!g.started && (
        <div className="button-row mt">
          <Button variant="outline" onClick={() => setEditor("new")}>
            <Plus size={16} />
            Добавить
          </Button>
          <Button variant="outline" onClick={() => setImporting(true)}>
            <Upload size={16} />
            Импорт XLSX / JSON
          </Button>
          <Button
            disabled={action.busy || g.confirmed}
            onClick={() => action.run("/groups/" + g.id + "/confirm", "POST")}
          >
            <CheckCircle2 size={16} />
            Подтвердить список
          </Button>
        </div>
      )}
      {editor && (
        <Editor
          title={
            editor === "new" ? "Новый участник" : "Редактировать участника"
          }
          fields={participantFields}
          initial={
            editor === "new"
              ? {}
              : {
                  name: editor.name,
                  email: editor.email,
                  phone: editor.phone,
                  kind: editor.kind,
                }
          }
          onClose={() => setEditor(null)}
          onSave={(v) =>
            save(
              editor === "new"
                ? "/groups/" + g.id + "/participants"
                : "/participants/" + editor.id,
              editor === "new" ? "POST" : "PUT",
              v,
            )
          }
        />
      )}
      {importing && (
        <ImportPeople groupId={g.id} onClose={() => setImporting(false)} />
      )}
    </Modal>
  );
}
function ImportPeople({
  groupId,
  onClose,
}: {
  groupId: number;
  onClose: () => void;
}) {
  const [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState<ImportPreview | null>(null),
    action = useAction();
  async function upload(commit: boolean) {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    form.append("commit", String(commit));
    const result = await action.run<ImportPreview>(
      "/groups/" + groupId + "/import",
      "POST",
      form,
    );
    if (result) {
      setPreview(result);
      if (commit) onClose();
    }
  }
  return (
    <Modal title="Импорт участников в выбранную группу" onClose={onClose}>
      <p className="muted">
        XLSX со столбцами Фамилия, Имя, Email и Номер телефона либо JSON заявок.
        Паспортные данные и СНИЛС не сохраняются.
      </p>
      <label className="upload-zone">
        <Upload size={26} />
        <span>Выберите XLSX или JSON</span>
        <input
          type="file"
          accept=".xlsx,.json"
          onChange={(e) => {
            setFile(e.target.files?.[0] || null);
            setPreview(null);
          }}
        />
      </label>
      {action.notice}
      <Button
        disabled={!file || action.busy}
        variant="outline"
        onClick={() => upload(false)}
      >
        Предпросмотр
      </Button>
      {preview && (
        <>
          <h3>Предпросмотр: {preview.rows.length} записей</h3>
          {preview.ignored_columns.length > 0 && (
            <p className="muted">
              Пропущенные столбцы: {preview.ignored_columns.join(", ")}
            </p>
          )}
          {preview.errors.map((e, i) => (
            <div role="alert" className="notice error" key={i}>
              Строка {e.row}: {e.message}
            </div>
          ))}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Строка</th>
                  <th>ФИО</th>
                  <th>Email</th>
                  <th>Действие</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r, i) => (
                  <tr key={i}>
                    <td>{r.row}</td>
                    <td>{r.name}</td>
                    <td>{r.email}</td>
                    <td>
                      {r.action === "skip" ? "Уже существует" : "Добавить"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="form-actions">
            <Button
              disabled={action.busy || !!preview.errors.length}
              onClick={() => upload(true)}
            >
              Подтвердить импорт
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
