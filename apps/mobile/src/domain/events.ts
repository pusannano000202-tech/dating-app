export type TonightEventKind = 'dinner' | 'jogging' | 'board-game' | 'drinks';

export type TonightEvent = {
  id: string;
  kind: TonightEventKind;
  scheduleType: 'tonight' | 'scheduled';
  eyebrow: string;
  title: string;
  description: string;
  venue: string;
  meetingTime: string;
  capacity: 5;
  remaining: number | null;
  imageKey: TonightEventKind;
};
