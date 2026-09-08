import { Redirect } from 'expo-router';

import { SurveyScreen } from './profile/survey';

export default function DevSurveyPreview() {
  if (!__DEV__) return <Redirect href="/login" />;
  return <SurveyScreen preview />;
}
