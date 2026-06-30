import { Permission } from "../constants";

declare global {
  namespace Express {
    interface AuthUser {
      id: string;
      email: string;
      fullName: string;
      isActive: boolean;
      roleName: string | null;
      permissions: Permission[];
    }
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
