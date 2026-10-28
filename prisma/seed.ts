// Synthetic data for the AML Alert Investigation Assistant.
// Everything here is fake. Run with: npm run db:seed

import "dotenv/config";
import { faker } from "@faker-js/faker";
import { PrismaClient } from "../src/generated/prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// The same seed gives the same data every run, which makes testing easier.
faker.seed(42);

const CUSTOMER_COUNT = 200;
const SUSPICIOUS_COUNT = 10; // about 5% of customers
const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();

const daysAgo = (days: number) =>
  new Date(now - days * DAY - faker.number.int({ min: 0, max: 20 }) * 60 * 60 * 1000);

const money = (min: number, max: number) =>
  faker.number.float({ min, max, fractionDigits: 2 });

type Tx = {
  accountId: string;
  occurredAt: Date;
  amount: number;
  direction: "in" | "out";
  channel: "cash" | "transfer" | "card";
  counterparty?: string;
  counterpartyCountry?: string;
  description?: string;
};

const transactions: Tx[] = [];

const SHOPS = [
  "Countdown",
  "New World",
  "Z Energy",
  "Bunnings",
  "Uber Eats",
  "Spark",
  "Mercury Energy",
  "The Warehouse",
];

// Normal everyday activity: salary in, rent out, and card purchases.
function addNormalActivity(accountId: string, monthlyIncome: number, fromDay: number, toDay: number) {
  const clamp = (d: number) => Math.max(d, toDay);

  for (let d = fromDay; d > toDay; d -= 30) {
    transactions.push({
      accountId,
      occurredAt: daysAgo(d),
      amount: monthlyIncome,
      direction: "in",
      channel: "transfer",
      counterparty: faker.company.name(),
      counterpartyCountry: "NZ",
      description: "Salary",
    });

    transactions.push({
      accountId,
      occurredAt: daysAgo(clamp(d - 2)),
      amount: Math.round(monthlyIncome * 0.3 * 100) / 100,
      direction: "out",
      channel: "transfer",
      counterparty: "Harbour Property Management",
      counterpartyCountry: "NZ",
      description: "Rent",
    });

    const purchases = faker.number.int({ min: 8, max: 15 });
    for (let i = 0; i < purchases; i++) {
      transactions.push({
        accountId,
        occurredAt: daysAgo(clamp(d - faker.number.int({ min: 0, max: 29 }))),
        amount: money(10, 250),
        direction: "out",
        channel: "card",
        counterparty: faker.helpers.arrayElement(SHOPS),
        counterpartyCountry: "NZ",
        description: "Card purchase",
      });
    }
  }
}

// Planted suspicious patterns, one per detection rule.
const patterns = {
  structuring(accountId: string) {
    const start = faker.number.int({ min: 20, max: 60 });
    for (let i = 0; i < 4; i++) {
      transactions.push({
        accountId,
        occurredAt: daysAgo(start - i),
        amount: money(8000, 9999),
        direction: "in",
        channel: "cash",
        description: "Cash deposit",
      });
    }
  },

  rapidMovement(accountId: string) {
    const day = faker.number.int({ min: 10, max: 40 });
    const amountIn = money(20000, 30000);
    transactions.push({
      accountId,
      occurredAt: daysAgo(day),
      amount: amountIn,
      direction: "in",
      channel: "transfer",
      counterparty: faker.company.name(),
      counterpartyCountry: "NZ",
      description: "Incoming transfer",
    });
    transactions.push({
      accountId,
      occurredAt: daysAgo(day - 1),
      amount: Math.round(amountIn * 0.92 * 100) / 100,
      direction: "out",
      channel: "transfer",
      counterparty: faker.person.fullName(),
      counterpartyCountry: "AU",
      description: "Outgoing transfer",
    });
  },

  highRiskJurisdiction(accountId: string) {
    transactions.push({
      accountId,
      occurredAt: daysAgo(faker.number.int({ min: 5, max: 50 })),
      amount: money(3000, 9000),
      direction: "out",
      channel: "transfer",
      counterparty: faker.person.fullName(),
      // Illustrative codes only; the real list is configured by an admin.
      counterpartyCountry: faker.helpers.arrayElement(["IR", "KP", "MM"]),
      description: "International transfer",
    });
  },

  unusualVolume(accountId: string) {
    const start = faker.number.int({ min: 15, max: 45 });
    for (let i = 0; i < 5; i++) {
      transactions.push({
        accountId,
        occurredAt: daysAgo(start - i * 5),
        amount: money(8000, 15000),
        direction: "in",
        channel: "transfer",
        counterparty: faker.company.name(),
        counterpartyCountry: "NZ",
        description: "Incoming transfer",
      });
    }
  },

  dormantReactivated(accountId: string) {
    for (let i = 0; i < 3; i++) {
      transactions.push({
        accountId,
        occurredAt: daysAgo(5 - i),
        amount: money(2000, 4000),
        direction: "in",
        channel: "cash",
        description: "Cash deposit",
      });
    }
  },
};

type PatternName = keyof typeof patterns;
const patternNames = Object.keys(patterns) as PatternName[];

async function main() {
  console.log("Clearing old data...");
  await prisma.alert.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.account.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.user.deleteMany();
  const passwordHash = await bcrypt.hash("Password123!", 10);
  await prisma.user.createMany({
    data: [
      { email: "analyst@caselens.test", name: "Alex Analyst", role: "analyst", passwordHash },
      { email: "supervisor@caselens.test", name: "Sam Supervisor", role: "supervisor", passwordHash },
      { email: "admin@caselens.test", name: "Ari Admin", role: "admin", passwordHash },
    ],
  });

  // Pick which customers get a planted pattern, two per rule.
  const suspicious = new Map<number, PatternName>();
  faker.helpers
    .arrayElements([...Array(CUSTOMER_COUNT).keys()], SUSPICIOUS_COUNT)
    .forEach((index, i) => suspicious.set(index, patternNames[i % patternNames.length]));

  console.log(`Creating ${CUSTOMER_COUNT} customers...`);
  const planted: { customer: string; pattern: PatternName }[] = [];
  let accountCounter = 1;

  for (let i = 0; i < CUSTOMER_COUNT; i++) {
    const reference = `CUS-${String(i + 1).padStart(5, "0")}`;
    const monthlyIncome = money(3500, 12000);
    const accountCount = faker.number.int({ min: 1, max: 2 });

    const customer = await prisma.customer.create({
      data: {
        reference,
        occupation: faker.person.jobTitle(),
        riskRating: faker.helpers.weightedArrayElement([
          { value: "low", weight: 70 },
          { value: "medium", weight: 25 },
          { value: "high", weight: 5 },
        ]),
        expectedMonthlyVolume: Math.round(monthlyIncome * 1.2),
        onboardedAt: faker.date.past({ years: 5 }),
        accounts: {
          create: Array.from({ length: accountCount }, () => ({
            accountNumber: `12-3${String(accountCounter).padStart(3, "0")}-${String(accountCounter++).padStart(7, "0")}-00`,
            type: faker.helpers.arrayElement(["everyday", "savings"]),
            openedAt: faker.date.past({ years: 4 }),
          })),
        },
      },
      include: { accounts: true },
    });

    const mainAccount = customer.accounts[0].id;
    const pattern = suspicious.get(i);

    if (pattern === "dormantReactivated") {
      // Normal activity stops about 7 months ago, then the account wakes up.
      addNormalActivity(mainAccount, monthlyIncome, 365, 220);
    } else {
      addNormalActivity(mainAccount, monthlyIncome, 365, 0);
    }

    if (pattern) {
      patterns[pattern](mainAccount);
      planted.push({ customer: reference, pattern });
    }
  }

  console.log(`Inserting ${transactions.length} transactions...`);
  const BATCH = 1000;
  for (let i = 0; i < transactions.length; i += BATCH) {
    await prisma.transaction.createMany({ data: transactions.slice(i, i + BATCH) });
  }

  console.log("\nDone. Planted suspicious patterns:");
  console.table(planted);
  console.log(
    `Customers: ${await prisma.customer.count()}, accounts: ${await prisma.account.count()}, transactions: ${await prisma.transaction.count()}`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });