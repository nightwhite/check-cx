import * as React from "react";

import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";
import { Select } from "../../../components/ui/select";
import { Textarea } from "../../../components/ui/textarea";
import type { AdminProviderType } from "./admin-types";

export const providerOptions: Array<{
  value: AdminProviderType;
  label: string;
}> = [
  { value: "openai", label: "OpenAI" },
  { value: "gemini", label: "Gemini" },
  { value: "anthropic", label: "Anthropic" },
];

interface FieldProps {
  label: string;
  error?: string;
  children: React.ReactNode;
}

export function Field({ label, error, children }: FieldProps) {
  const id = React.useId();
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {React.isValidElement(children)
        ? React.cloneElement(children, {
            id,
            "aria-invalid": error ? "true" : undefined,
          } as Record<string, unknown>)
        : children}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}

export function ProviderSelect({
  value,
  onChange,
}: {
  value: AdminProviderType;
  onChange(value: AdminProviderType): void;
}) {
  return (
    <Select
      value={value}
      onChange={(event) => onChange(event.target.value as AdminProviderType)}
    >
      {providerOptions.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <Input {...props} />;
}

export function JsonTextarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement>
) {
  return <Textarea spellCheck={false} {...props} />;
}
