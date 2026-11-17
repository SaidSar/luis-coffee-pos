// Seed idempotente: se puede ejecutar varias veces sin duplicar datos.
//   npm run db:seed
// - 8 mesas (capacidad 4). Si ya existen, no se modifican (se respeta su estado actual).
// - Admin opcional: solo si SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD están definidos en el entorno.
//   Si el email ya existe, no se toca (no se resetea la contraseña).
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TABLE_COUNT    = 8;
const TABLE_CAPACITY = 4;

async function seedTables() {
  let created = 0;
  for (let number = 1; number <= TABLE_COUNT; number++) {
    const existing = await prisma.table.findUnique({ where: { number } });
    if (existing) continue;
    await prisma.table.create({ data: { number, capacity: TABLE_CAPACITY } });
    created++;
  }
  console.log(`Mesas: ${created} creadas, ${TABLE_COUNT - created} ya existían`);
}

async function seedAdmin() {
  const email    = process.env.SEED_ADMIN_EMAIL?.trim();
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    console.log('Admin: omitido (define SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD para crearlo)');
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log('Admin: ya existe, sin cambios');
    return;
  }

  await prisma.user.create({
    data: {
      name:         process.env.SEED_ADMIN_NAME?.trim() || 'Administrador',
      email,
      passwordHash: await bcrypt.hash(password, 10),
      role:         'ADMIN',
    },
  });
  console.log('Admin: creado');
}

seedTables()
  .then(seedAdmin)
  .catch((err) => {
    console.error('Error en el seed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
