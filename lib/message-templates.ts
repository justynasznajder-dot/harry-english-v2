import type { MessagePortalRole } from "@/lib/messages";

export type MessageTemplateKey =
  | "lesson_cancel"
  | "payment_reminder"
  | "group_proposal"
  | "schedule_change"
  | "absence_excuse"
  | "resignation"
  | "payment_question"
  | "group_change_request"
  | "general_contact";

export type MessageTemplate = {
  key: MessageTemplateKey;
  label: string;
  subject: string;
  content: string;
  audiences: MessagePortalRole[];
};

export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  {
    key: "lesson_cancel",
    label: "Anulowanie zajęć",
    subject: "Anulowanie zajęć — {{data}}",
    content: `Dzień dobry,

Informujemy, że zajęcia zaplanowane na {{data}} (grupa {{grupa}}) zostały anulowane.

Powód: {{powod}}

Prosimy o kontakt w razie pytań.

Pozdrawiamy,
Zespół Harry English`,
    audiences: ["MANAGER", "TEACHER"],
  },
  {
    key: "payment_reminder",
    label: "Przypomnienie o płatności",
    subject: "Przypomnienie o płatności — {{miesiac}}",
    content: `Dzień dobry,

Przypominamy o płatności za zajęcia w okresie {{miesiac}}.

Kwota do zapłaty: {{kwota}} zł

W razie pytań prosimy o kontakt.

Pozdrawiamy,
Zespół Harry English`,
    audiences: ["MANAGER"],
  },
  {
    key: "group_proposal",
    label: "Propozycja grupy",
    subject: "Propozycja grupy dla {{dziecko}}",
    content: `Dzień dobry,

Mamy propozycję grupy dla {{dziecko}}:

Grupa: {{grupa}}
Lokalizacja: {{lokalizacja}}
Termin: {{termin}}

Prosimy o zalogowanie się do portalu rodzica i zaakceptowanie propozycji lub kontakt w celu ustalenia innego terminu.

Pozdrawiamy,
Zespół Harry English`,
    audiences: ["MANAGER"],
  },
  {
    key: "schedule_change",
    label: "Zmiana terminu zajęć",
    subject: "Zmiana terminu zajęć — {{grupa}}",
    content: `Dzień dobry,

Informujemy o zmianie terminu zajęć grupy {{grupa}}.

Dotychczasowy termin: {{stary_termin}}
Nowy termin: {{nowy_termin}}
Pierwsze zajęcia w nowym terminie: {{data}}

W razie pytań prosimy o kontakt.

Pozdrawiamy,
Zespół Harry English`,
    audiences: ["MANAGER", "TEACHER"],
  },
  {
    key: "resignation",
    label: "Rezygnacja z zajęć",
    subject: "Rezygnacja z zajęć — {{dziecko}}",
    content: `Dzień dobry,

Chciał(a)bym zgłosić rezygnację z zajęć dla {{dziecko}} w trakcie roku szkolnego.

Powód: {{powod}}

Proszę o kontakt w sprawie formalności. Rozumiem, że dziecko nie zostaje automatycznie wypisane z grupy.

Pozdrawiam`,
    audiences: ["PARENT"],
  },
  {
    key: "absence_excuse",
    label: "Usprawiedliwienie nieobecności",
    subject: "Nieobecność — {{dziecko}} ({{data}})",
    content: `Dzień dobry,

Informuję, że {{dziecko}} nie będzie obecne/obecny na zajęciach w dniu {{data}}.

Powód: {{powod}}

Pozdrawiam`,
    audiences: ["PARENT"],
  },
  {
    key: "payment_question",
    label: "Pytanie o płatność",
    subject: "Pytanie o płatność — {{miesiac}}",
    content: `Dzień dobry,

Chciał(a)bym dopytać o płatność za zajęcia w okresie {{miesiac}}.

{{pytanie}}

Pozdrawiam`,
    audiences: ["PARENT"],
  },
  {
    key: "group_change_request",
    label: "Prośba o zmianę grupy / terminu",
    subject: "Prośba o zmianę grupy / terminu — {{dziecko}}",
    content: `Dzień dobry,

Chciał(a)bym poprosić o zmianę grupy lub terminu zajęć dla {{dziecko}}.

Obecna grupa / termin: {{obecny_termin}}
Preferowany termin: {{preferowany_termin}}
Dodatkowe informacje: {{uwagi}}

Pozdrawiam`,
    audiences: ["PARENT"],
  },
  {
    key: "general_contact",
    label: "Ogólne pytanie",
    subject: "Pytanie do szkoły",
    content: `Dzień dobry,

{{tresc}}

Pozdrawiam`,
    audiences: ["PARENT"],
  },
];

export function getMessageTemplate(key: string): MessageTemplate | undefined {
  return MESSAGE_TEMPLATES.find((t) => t.key === key);
}

export function getMessageTemplatesForRole(role: MessagePortalRole): MessageTemplate[] {
  return MESSAGE_TEMPLATES.filter((t) => t.audiences.includes(role));
}

export type TemplateFieldMeta = {
  label: string;
  placeholder?: string;
  multiline?: boolean;
};

const TEMPLATE_FIELD_META: Record<string, TemplateFieldMeta> = {
  dziecko: {
    label: "Dziecko",
    placeholder: "Wybierz dziecko…",
  },
  powod: {
    label: "Powód",
    placeholder: "Np. zmiana planu dnia, przeprowadzka…",
    multiline: true,
  },
  data: {
    label: "Data",
    placeholder: "Np. 15.09.2026",
  },
  grupa: {
    label: "Grupa",
    placeholder: "Nazwa grupy",
  },
  miesiac: {
    label: "Miesiąc / okres",
    placeholder: "Np. wrzesień 2026",
  },
  kwota: {
    label: "Kwota",
    placeholder: "Np. 280",
  },
  lokalizacja: {
    label: "Lokalizacja",
    placeholder: "Np. centrum",
  },
  termin: {
    label: "Termin",
    placeholder: "Np. wtorek 16:00",
  },
  stary_termin: {
    label: "Dotychczasowy termin",
    placeholder: "Np. wtorek 16:00",
  },
  nowy_termin: {
    label: "Nowy termin",
    placeholder: "Np. środa 17:00",
  },
  pytanie: {
    label: "Twoje pytanie",
    placeholder: "Opisz, o co chcesz zapytać…",
    multiline: true,
  },
  obecny_termin: {
    label: "Obecna grupa / termin",
    placeholder: "Np. grupa A, wtorek 16:00",
  },
  preferowany_termin: {
    label: "Preferowany termin",
    placeholder: "Np. czwartek po 17:00",
  },
  uwagi: {
    label: "Dodatkowe informacje",
    placeholder: "Opcjonalnie…",
    multiline: true,
  },
  tresc: {
    label: "Treść pytania",
    placeholder: "Napisz, o co chcesz zapytać…",
    multiline: true,
  },
};

const PLACEHOLDER_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export function extractTemplatePlaceholders(subject: string, content: string): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const text of [subject, content]) {
    PLACEHOLDER_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = PLACEHOLDER_RE.exec(text)) !== null) {
      const key = match[1];
      if (!seen.has(key)) {
        seen.add(key);
        keys.push(key);
      }
    }
  }
  return keys;
}

export function getTemplateFieldMeta(key: string): TemplateFieldMeta {
  return (
    TEMPLATE_FIELD_META[key] ?? {
      label: key.replace(/_/g, " "),
      multiline: false,
    }
  );
}

export function fillTemplatePlaceholders(text: string, values: Record<string, string>): string {
  return text.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    const value = values[key]?.trim() ?? "";
    return value;
  });
}

export function applyTemplateValues(
  template: Pick<MessageTemplate, "subject" | "content">,
  values: Record<string, string>
): { subject: string; content: string } {
  return {
    subject: fillTemplatePlaceholders(template.subject, values),
    content: fillTemplatePlaceholders(template.content, values),
  };
}
