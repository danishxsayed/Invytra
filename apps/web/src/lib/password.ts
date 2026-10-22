import bcrypt from "bcryptjs";

const COST = 12;
export const MIN_PASSWORD_LENGTH = 10;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COST);
}

/** Always runs a bcrypt compare, even for unknown users, so timing doesn't reveal which emails exist. */
let dummyHash: string | undefined;
export function verifyPassword(password: string, hash: string | null | undefined): Promise<boolean> {
  dummyHash ??= bcrypt.hashSync("invytra-timing-equaliser", COST);
  return bcrypt.compare(password, hash ?? dummyHash);
}
