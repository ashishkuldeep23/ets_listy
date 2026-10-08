// Size limits shared by the validators and the Mongoose schemas, so the
// API and the database can never disagree about what is allowed.
export const LIMITS = {
  USER_NAME_MAX: 60,
  EMAIL_MAX: 254,
  PASSWORD_MIN: 8,
  // bcrypt only uses the first 72 bytes of a password; longer ones would
  // silently match on their prefix, so they are rejected instead.
  PASSWORD_MAX_BYTES: 72,

  FOLDER_NAME_MAX: 60,
  FOLDERS_PER_USER: 200,
};
