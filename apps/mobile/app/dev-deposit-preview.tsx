import { Redirect } from 'expo-router';

import { DepositScreen } from './deposit';

export default function DevDepositPreviewScreen() {
  if (!__DEV__) return <Redirect href="/login" />;
  return <DepositScreen preview />;
}
