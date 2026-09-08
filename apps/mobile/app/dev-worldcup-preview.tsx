import { Redirect } from 'expo-router';

import { WorldcupScreen } from './profile/worldcup';

export default function DevWorldcupPreview() {
  if (!__DEV__) return <Redirect href="/login" />;
  return <WorldcupScreen preview />;
}
