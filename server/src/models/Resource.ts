import { type HydratedDocument, type InferSchemaType, Schema, model } from 'mongoose';

/** The order matters: the catalog lists types in this order, rooms first. */
export const RESOURCE_TYPES = ['room', 'equipment'] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const MAX_TAGS = 10;

/** Resource names are unique ignoring case, and sorted ignoring case (PLAN.md §5). */
export const NAME_COLLATION = { locale: 'en', strength: 2 } as const;

/** The resource shape the API returns. */
export interface PublicResource {
  id: string;
  name: string;
  type: ResourceType;
  location: string;
  capacity: number | null;
  description: string;
  tags: string[];
  isActive: boolean;
}

const resourceSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
    type: { type: String, enum: RESOURCE_TYPES, required: true },
    location: { type: String, required: true, trim: true },
    // Rooms: a whole number of 1 or more. Equipment: always null. Enforced in the validate hook below.
    capacity: { type: Number, default: null },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    tags: {
      type: [{ type: String, trim: true, minlength: 1, maxlength: 30 }],
      default: [],
      validate: { validator: (tags: string[]) => tags.length <= MAX_TAGS, message: `Use at most ${MAX_TAGS} tags` },
    },
    // Resources are deactivated, never deleted, so existing bookings keep their history (PLAN.md D9).
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

resourceSchema.pre('validate', function () {
  if (this.type === 'room') {
    if (!Number.isInteger(this.capacity) || (this.capacity as number) < 1) {
      this.invalidate('capacity', 'A room needs a capacity of 1 or more');
    }
  } else if (this.type === 'equipment') {
    this.capacity = null;
  }
});

resourceSchema.index({ name: 1 }, { unique: true, collation: NAME_COLLATION });
resourceSchema.index({ isActive: 1, type: 1 });

export type ResourceDocument = HydratedDocument<InferSchemaType<typeof resourceSchema>>;

export const Resource = model('Resource', resourceSchema);

export function toPublicResource(resource: {
  _id: { toString(): string };
  name: string;
  type: ResourceType;
  location: string;
  capacity?: number | null;
  description?: string | null;
  tags: string[];
  isActive: boolean;
}): PublicResource {
  return {
    id: resource._id.toString(),
    name: resource.name,
    type: resource.type,
    location: resource.location,
    capacity: resource.capacity ?? null,
    description: resource.description ?? '',
    tags: [...resource.tags],
    isActive: resource.isActive,
  };
}
