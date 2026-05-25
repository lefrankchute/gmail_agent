export interface MessageSection {
  header?: string;
  items: string[];
}

export interface RichMessage {
  title?: string;
  body: string;
  sections?: MessageSection[];
  urgent?: boolean;
}

// Contrato base — nunca cambia independientemente del proveedor
export interface NotificationProvider {
  sendText(to: string, message: string): Promise<void>;
  sendRich(to: string, message: RichMessage): Promise<void>;
  isAvailable(): Promise<boolean>;
}
