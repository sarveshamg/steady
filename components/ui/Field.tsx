import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from "react";

/** Shared input look: white, 8px radius, line-strong border, primary border on focus. */
export const inputClass =
  "min-h-11 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-ink placeholder:text-muted " +
  "hover:border-muted focus-visible:border-primary disabled:cursor-not-allowed disabled:bg-page disabled:text-muted";

/** Label above, control in the middle, hint below. The hint is linked with aria-describedby. */
export function Field(props: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  optional?: boolean;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-2 ${props.className ?? ""}`}>
      <label htmlFor={props.id} className="block font-semibold">
        {props.label}
        {props.optional && <span className="font-normal text-muted"> (optional)</span>}
      </label>
      {props.children}
      {props.hint && (
        <p id={`${props.id}-hint`} className="text-sm text-muted">
          {props.hint}
        </p>
      )}
    </div>
  );
}

export function TextInput({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={`${inputClass} ${className}`} />;
}

export function TextArea({ className = "", ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={`${inputClass} ${className}`} />;
}
