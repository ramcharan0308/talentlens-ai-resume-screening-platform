/**
 * TalentLens Enterprise - Administrator User Provisioning CLI
 *
 * Usage:
 *   npx tsx scripts/provision-user.ts --email=qa.recruiter@companya-noida.internal --role=RECRUITER --name="QA Recruiter"
 *   npx tsx scripts/provision-user.ts --email=qa.delivery@companya-noida.internal --role=DELIVERY_HEAD --name="QA Delivery Head"
 *   npx tsx scripts/provision-user.ts --email=qa.client@fintechglobal.com --role=CLIENT_HIRING_MGR --name="QA Client Manager"
 *
 * Optional flags:
 *   --password=<securePassword>  (If omitted, a cryptographically secure 24-character password is generated)
 *   --orgId=<uuid>               (Defaults to Agency "00000000-0000-0000-0000-000000000001" for RECRUITER/DELIVERY_HEAD
 *                                 or Client "00000000-0000-0000-0000-000000000002" for CLIENT_HIRING_MGR)
 */

import crypto from "crypto";
import bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";
import { prisma } from "../src/lib/prisma";

function parseArgs(): Record<string, string> {
  const args: Record<string, string> = {};
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--")) {
      const [key, ...vals] = arg.slice(2).split("=");
      args[key] = vals.join("=");
    }
  }
  return args;
}

async function main() {
  const args = parseArgs();

  const email = (args.email || "").trim().toLowerCase();
  const name = (args.name || "").trim();
  const roleInput = (args.role || "").trim().toUpperCase();
  let password = args.password || "";
  let orgId = args.orgId || "";

  if (!email || !email.includes("@")) {
    console.error("Error: Valid --email is required.");
    console.log("Usage: npx tsx scripts/provision-user.ts --email=user@org.internal --role=RECRUITER --name=\"Full Name\"");
    process.exit(1);
  }

  const validRoles: UserRole[] = [
    UserRole.RECRUITER,
    UserRole.DELIVERY_HEAD,
    UserRole.CLIENT_HIRING_MGR,
  ];

  if (!validRoles.includes(roleInput as UserRole)) {
    console.error(`Error: Invalid --role "${roleInput}". Must be one of: ${validRoles.join(", ")}`);
    process.exit(1);
  }

  const role = roleInput as UserRole;

  // Resolve default organizations if not explicitly specified
  if (!orgId) {
    if (role === UserRole.CLIENT_HIRING_MGR) {
      // Default to FinTech Global Technologies client org
      orgId = "00000000-0000-0000-0000-000000000002";
    } else {
      // Default to Company A Staffing Services (Noida) agency org
      orgId = "00000000-0000-0000-0000-000000000001";
    }
  }

  // Verify organization exists in database
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
  });

  if (!org) {
    console.error(`Error: Organization ID "${orgId}" not found in database.`);
    process.exit(1);
  }

  // Generate strong random password if omitted
  let isGeneratedPassword = false;
  if (!password) {
    password = "TL-" + crypto.randomBytes(12).toString("base64url") + "!2026";
    isGeneratedPassword = true;
  }

  if (password.length < 8) {
    console.error("Error: Password must be at least 8 characters long.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name: name || undefined,
      role,
      organizationId: org.id,
      passwordHash,
      isActive: true,
    },
    create: {
      email,
      name: name || email.split("@")[0],
      role,
      organizationId: org.id,
      passwordHash,
      isActive: true,
    },
    include: {
      organization: true,
    },
  });

  console.log("\n==================================================================");
  console.log(" TalentLens User Provisioning Successful");
  console.log("==================================================================");
  console.log(` User ID:        ${user.id}`);
  console.log(` Name:           ${user.name}`);
  console.log(` Email:          ${user.email}`);
  console.log(` Role:           ${user.role}`);
  console.log(` Organization:   ${user.organization.name} (${user.organization.type})`);
  console.log(` Status:         Active (${user.isActive})`);
  console.log(` Password:       ${password} ${isGeneratedPassword ? "(Auto-generated)" : "(Explicitly set)"}`);
  console.log("==================================================================");
  console.log("Share these credentials securely with the authorized operator.");
  console.log("==================================================================\n");
}

main()
  .catch((e) => {
    console.error("Provisioning failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
