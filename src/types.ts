export type Role = "customer" | "technician" | "shop" | "administrator";

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  location?: string;
  bio?: string;
  verified?: boolean;
  suspended?: boolean;
};

export type Credentials = { email: string; password: string };

export type AuthAdapter = {
  register: (user: User, password: string) => Promise<User>;
  login: (credentials: Credentials) => Promise<User>;
  logout: () => Promise<void>;
  getCurrentUser: () => User | null;
  saveProfile: (profile: Partial<User>) => Promise<User>;
};

export type ListingType = "technician" | "shop" | "seller";
export type RequestStatus = "open" | "accepted" | "declined" | "completed" | "cancelled";

export type Listing = {
  id: string;
  ownerId?: string;
  name: string;
  type: ListingType;
  location: string;
  text: string;
  services: string[];
  verified: boolean;
  rating: number;
  availability?: string;
  moderationStatus?: "pending" | "approved" | "rejected";
};

export type ServiceRequest = {
  id: string;
  customerId: string;
  providerId?: string;
  listingId: string;
  title: string;
  details: string;
  status: RequestStatus;
  createdAt: string;
  preferredDate?: string;
  preferredTime?: string;
  confirmedDate?: string;
  confirmedTime?: string;
};

export type Message = {
  id: string;
  requestId: string;
  senderId: string;
  body: string;
  createdAt: string;
};

export type Review = {
  id: string;
  listingId: string;
  requestId: string;
  authorId: string;
  rating: number;
  body: string;
  createdAt: string;
};

export type Notification = {
  id: string;
  userId: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
};

export type ListingReport = {
  id: string;
  listingId: string;
  reporterId: string;
  reason: string;
  details: string;
  status: "open" | "resolved" | "dismissed";
  createdAt: string;
};

export type AuditEvent = {
  id: string;
  actorId: string;
  action: string;
  target: string;
  details: string;
  createdAt: string;
};
