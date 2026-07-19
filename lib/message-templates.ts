export type MessageTemplateKey = "lesson_cancel" | "payment_reminder" | "group_proposal";

export type MessageTemplate = {
  key: MessageTemplateKey;
  label: string;
  subject: string;
  content: string;
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
  },
];

export function getMessageTemplate(key: string): MessageTemplate | undefined {
  return MESSAGE_TEMPLATES.find((t) => t.key === key);
}
