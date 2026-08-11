import { Redirect } from 'expo-router';

import { FriendDateScreen } from './friends/[id]';

export default function FriendDatePreviewRoute() {
  if (!__DEV__) return <Redirect href="/login" />;

  return (
    <FriendDateScreen
      friendUserId="00000000-0000-4000-8000-000000000002"
      routeName="민지"
      preview
    />
  );
}
