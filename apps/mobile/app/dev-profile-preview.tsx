import { Redirect } from 'expo-router';

import { BasicProfileScreen } from './profile/basic';

export default function DevProfilePreviewScreen() {
  if (!__DEV__) return <Redirect href="/login" />;
  return <BasicProfileScreen preview />;
}
