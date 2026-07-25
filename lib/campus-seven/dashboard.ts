type CampusSevenLocationSchedule = {
  meetingPointName?: string | null
  meetingPointAddress?: string | null
  venueName?: string | null
  venueAddress?: string | null
  venueBookingUrl?: string | null
  allowedMenuNote?: string | null
}

type CampusSevenLocationDashboard = {
  schedule?: CampusSevenLocationSchedule | null
  reservationTask?: unknown
}

type CampusSevenGuideMessages = {
  messages: Array<{ id: string }>
}

export function redactCampusSevenLocation<T extends CampusSevenLocationDashboard>(
  dashboard: T,
  liveGuide: CampusSevenGuideMessages | null,
): T {
  if (!dashboard.schedule) return dashboard

  const arrivalCueReached = liveGuide?.messages.some((message) => message.id.endsWith('-arrival')) === true
  if (arrivalCueReached || Boolean(dashboard.reservationTask)) return dashboard

  return {
    ...dashboard,
    schedule: {
      ...dashboard.schedule,
      meetingPointName: null,
      meetingPointAddress: null,
      venueName: null,
      venueAddress: null,
      venueBookingUrl: null,
      allowedMenuNote: null,
    },
  }
}
