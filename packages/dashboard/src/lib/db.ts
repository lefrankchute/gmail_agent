import { resolve } from 'path';
import { config } from 'dotenv';
config({ path: resolve(process.cwd(), '../../.env') });

import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
