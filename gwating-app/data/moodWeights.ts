import { MoodKey } from "@/types/matching";

export const moodWeights: Record<MoodKey, Record<MoodKey, number>> = {
  comfortableTalk: {
    comfortableTalk: 1.0,
    activeSocial:    0.6,
    gamesAndDrinks:  0.3,
    respectfulSafe:  0.8,
    naturalIntro:    0.9,
  },
  activeSocial: {
    comfortableTalk: 0.6,
    activeSocial:    1.0,
    gamesAndDrinks:  0.8,
    respectfulSafe:  0.4,
    naturalIntro:    0.7,
  },
  gamesAndDrinks: {
    comfortableTalk: 0.3,
    activeSocial:    0.8,
    gamesAndDrinks:  1.0,
    respectfulSafe:  0.2,
    naturalIntro:    0.5,
  },
  respectfulSafe: {
    comfortableTalk: 0.8,
    activeSocial:    0.4,
    gamesAndDrinks:  0.2,
    respectfulSafe:  1.0,
    naturalIntro:    0.7,
  },
  naturalIntro: {
    comfortableTalk: 0.9,
    activeSocial:    0.7,
    gamesAndDrinks:  0.5,
    respectfulSafe:  0.7,
    naturalIntro:    1.0,
  },
};
