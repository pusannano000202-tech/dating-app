import { Redirect } from 'expo-router';

import { CommunityScreen } from '../(tabs)/community';

export default function CommunityDevPreview() {
  if (!__DEV__) return <Redirect href="/login" />;
  return <CommunityScreen />;
}
