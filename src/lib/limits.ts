// Size limits shared by the validators and the Mongoose schemas, so the
// API and the database can never disagree about what is allowed.
export const LIMITS = {
  USER_NAME_MAX: 60,
  /** One-time code in Google's redirect; much longer means it isn't one. */
  GOOGLE_CODE_MAX: 2048,
  EMAIL_MAX: 254,
  PASSWORD_MIN: 8,
  // bcrypt only uses the first 72 bytes of a password; longer ones would
  // silently match on their prefix, so they are rejected instead.
  PASSWORD_MAX_BYTES: 72,

  FOLDER_NAME_MAX: 60,
  FOLDERS_PER_USER: 200,

  ITEM_NAME_MAX: 100,
  ITEM_CATEGORY_MAX: 40,
  ITEM_DESCRIPTION_MAX: 500,
  ITEM_GROUP_MAX: 40,
  ITEM_PRICE_MAX: 10_000_000, // rupees
  ITEM_PRICE_UNIT_MAX: 20, // "kg", "piece", "500 g"…
  ITEM_QUANTITY_MAX: 100_000,
  ITEMS_PER_FOLDER: 1000,
  SAVED_ITEMS_PER_USER: 500,
  SEARCH_QUERY_MAX: 100,
  SHARES_PER_FOLDER: 50,
  USER_SEARCH_MIN: 2,
  USER_SEARCH_RESULTS: 8,

  CHAT_MESSAGE_MAX: 1000,
  /** Messages loaded when the chat opens. */
  CHAT_HISTORY: 50,
  /** People tracked per list (bounds memory if someone floods fake guest ids). */
  PRESENCE_PER_FOLDER: 100,

  FEEDBACK_NAME_MAX: 60,
  FEEDBACK_MESSAGE_MAX: 1000,
  FEEDBACK_RATING_MIN: 1,
  FEEDBACK_RATING_MAX: 5,
  /** Newest feedback shown on the page. */
  FEEDBACK_LIST: 100,

  /** How far ahead a reminder can be set. */
  REMINDER_MAX_DAYS: 366,
  /** Devices that get my reminders; the oldest is dropped beyond this. */
  PUSH_DEVICES_PER_USER: 10,
  PUSH_ENDPOINT_MAX: 2048,
  PUSH_KEY_MAX: 256,
} as const;
