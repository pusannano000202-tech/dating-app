import AsyncStorage from '@react-native-async-storage/async-storage';

const MEETING_GUIDE_ACK_STORAGE_KEY = 'quantum.meeting-guide.v1';
const MEETING_GUIDE_ACK_STORAGE_VALUE = 'acknowledged';

export type MeetingGuideAcknowledgementStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

export async function markMeetingGuideAcknowledged(
  storage: MeetingGuideAcknowledgementStorage = AsyncStorage,
): Promise<void> {
  await storage.setItem(MEETING_GUIDE_ACK_STORAGE_KEY, MEETING_GUIDE_ACK_STORAGE_VALUE);
}

export async function hasAcknowledgedMeetingGuide(
  storage: MeetingGuideAcknowledgementStorage = AsyncStorage,
): Promise<boolean> {
  return await storage.getItem(MEETING_GUIDE_ACK_STORAGE_KEY) === MEETING_GUIDE_ACK_STORAGE_VALUE;
}
