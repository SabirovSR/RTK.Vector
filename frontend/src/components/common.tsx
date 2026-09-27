import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  LoaderCircle,
  Inbox,
  ArrowUpRight,
} from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { Button } from "./ui/button";
import { Modal } from "./ui/dialog";

export const stages: Record<string, string> = {
  new: "Новый контакт",
  qualification: "Квалификация",
  approval: "Согласование",
  contract: "Договор",
  preparation: "Подготовка",
  training: "Обучение",
  evaluation: "Результаты",
  completed: "Завершено",
  rejected: "Отказ",
};
export const statuses: Record<string, string> = {
  pending: "На согласовании",
  approved: "Согласовано",
  changes: "Нужны изменения",
  rejected: "Отклонено",
  none: "Нет предложения",
  accepted: "Принят",
  open: "Открыта",
  done: "Завершено",
  failed: "Ошибка",
  running: "Выполняется",
};
export const date = (value?: string) =>
  value
    ? new Date(
        value.length === 10
          ? value + "T12:00:00"
          : value + (value.endsWith("Z") ? "" : "Z"),
      ).toLocaleDateString("ru-RU", { day: "numeric", month: "short" })
    : "Не указан";
export const today = () => new Date().toLocaleDateString("sv-SE");
export function useData<T>(path: string) {
  return useQuery<T>({ queryKey: [path], queryFn: () => api<T>(path) });
}
export function useSave() {
  const client = useQueryClient();
  return async <T,>(path: string, method: string, body?: unknown) => {
    const result = await api<T>(path, method, body);
    await client.invalidateQueries();
    return result;
  };
}
export function useAction() {
  const client = useQueryClient();
  const [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [busy, setBusy] = useState(false);
  async function run<T>(
    path: string,
    method: string,
    body?: unknown,
  ): Promise<T | undefined> {
    setError("");
    setSuccess("");
    setBusy(true);
    try {
      const result = await api<T>(path, method, body);
      await client.invalidateQueries();
      setSuccess("Изменения сохранены");
      return result;
    } catch (e) {
      setError((e as Error).message);
      return undefined;
    } finally {
      setBusy(false);
    }
  }
  const notice = (
    <>
      {error && (
        <div className="notice error" role="alert">
          <AlertCircle size={18} />
          {error}
        </div>
      )}
      {success && (
        <div className="notice success" role="status">
          <CheckCircle2 size={17} />
          {success}
        </div>
      )}
    </>
  );
  return { run, busy, notice, setError };
}
export function Loading() {
  return (
    <div className="empty">
      <LoaderCircle className="spin" />
      Загружаем рабочее пространство…
    </div>
  );
}
export function ErrorState({ error }: { error: Error | null }) {
  return (
    <div role="alert" className="notice error">
      <AlertCircle size={18} />
      {error?.message || "Не удалось загрузить данные"}
    </div>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="empty">
      <Inbox size={30} />
      {children}
    </div>
  );
}
export function Badge({
  value,
  children,
}: {
  value?: string;
  children?: ReactNode;
}) {
  return (
    <span className={"badge badge-" + value}>
      {children || statuses[value || ""] || stages[value || ""] || value}
    </span>
  );
}
export function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function Section({
  title,
  children,
  action,
  className = "",
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <section className={"panel " + className}>
      <div className="section-heading">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
export function Progress({ value }: { value: number }) {
  return (
    <div className="progress">
      <span style={{ width: Math.max(0, Math.min(100, value)) + "%" }} />
    </div>
  );
}
export function DealLink({
  id,
  children,
}: {
  id: number;
  children: ReactNode;
}) {
  return (
    <Link className="text-link" to={"/deals/" + id}>
      {children}
      <ArrowUpRight size={15} />
    </Link>
  );
}
export type Field = {
  name: string;
  label: string;
  type?: "text" | "email" | "date" | "textarea" | "select" | "password";
  options?: Array<{ value: string | number; label: string }>;
  required?: boolean;
  placeholder?: string;
};
export function Editor({
  title,
  fields,
  initial = {},
  onSave,
  onClose,
  submitLabel = "Сохранить",
}: {
  title: string;
  fields: Field[];
  initial?: Record<string, string | number>;
  onSave: (values: Record<string, string>) => Promise<unknown>;
  onClose: () => void;
  submitLabel?: string;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title={title} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const result = await onSave(
              Object.fromEntries(new FormData(e.currentTarget)) as Record<
                string,
                string
              >,
            );
            if (result !== undefined) onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="form-fields">
          {fields.map((f) => (
            <label key={f.name}>
              {f.label}
              {f.type === "textarea" ? (
                <textarea
                  aria-label={f.label}
                  name={f.name}
                  defaultValue={initial[f.name] ?? ""}
                  required={f.required !== false}
                  placeholder={f.placeholder}
                  rows={4}
                />
              ) : f.type === "select" ? (
                <select
                  aria-label={f.label}
                  name={f.name}
                  defaultValue={initial[f.name] ?? f.options?.[0]?.value}
                  required={f.required !== false}
                >
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  aria-label={f.label}
                  name={f.name}
                  type={f.type || "text"}
                  defaultValue={initial[f.name] ?? ""}
                  required={f.required !== false}
                  placeholder={f.placeholder}
                />
              )}
            </label>
          ))}
        </div>
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        <div className="form-actions">
          <Button type="button" variant="outline" onClick={onClose}>
            Отмена
          </Button>
          <Button disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={16} /> : null}
            {submitLabel}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
