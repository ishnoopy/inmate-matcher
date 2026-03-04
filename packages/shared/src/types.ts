export type RosterSource = "madison" | "limestone";

export type RosterEntry = {
  id: string;
  source: RosterSource;

  fullNameRaw: string;
  nameNormalized: string;

  bookingNumber?: string | null;
  dob?: string | null;

  photoUrls: string[];

  scrapedAt: string;
};
