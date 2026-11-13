import { type InferSchemaType, type HydratedDocument, Schema, model } from 'mongoose';

export const USER_ROLES = ['member', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** The user shape the API returns. It never includes the password hash. */
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
    email: { type: String, required: true, trim: true, lowercase: true },
    // select: false keeps the hash out of every query unless it is asked for with `+passwordHash`.
    passwordHash: { type: String, required: true, select: false },
    // The role can't be set through the API: registration always creates a member (PLAN.md §7).
    role: { type: String, enum: USER_ROLES, default: 'member', required: true },
  },
  { timestamps: true },
);

userSchema.index({ email: 1 }, { unique: true });

export type UserDocument = HydratedDocument<InferSchemaType<typeof userSchema>>;

export const User = model('User', userSchema);

export function toPublicUser(user: { _id: { toString(): string }; name: string; email: string; role: UserRole }): PublicUser {
  return { id: user._id.toString(), name: user.name, email: user.email, role: user.role };
}
