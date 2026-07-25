const { insert } = require("./helpers");
const { hashPassword } = require("../../utils/password");

// Staff directory. The six role logins below are the documented test
// credentials (see phases/phase-01/02-seed-data.md and the README). Passwords
// are hashed here with the same helper the auth service uses.

const STAFF = [
  { full_name: "Olivia Owner", email: "owner@restaurantos.test", password: "Owner@123", role: "owner", phone: "+91 90000 00001" },
  { full_name: "Marcus Manager", email: "manager@restaurantos.test", password: "Manager@123", role: "manager", phone: "+91 90000 00002" },
  { full_name: "Chandra Chef", email: "chef@restaurantos.test", password: "Chef@123", role: "chef", phone: "+91 90000 00003" },
  { full_name: "Wade Waiter", email: "waiter@restaurantos.test", password: "Waiter@123", role: "waiter", phone: "+91 90000 00004" },
  { full_name: "Cassie Cashier", email: "cashier@restaurantos.test", password: "Cashier@123", role: "cashier", phone: "+91 90000 00005" },
  { full_name: "Sam Store", email: "store@restaurantos.test", password: "Store@123", role: "store_manager", phone: "+91 90000 00006" },
  // Extra staff so lists and waiter/chef assignment are non-trivial.
  { full_name: "Priya Server", email: "waiter2@restaurantos.test", password: "Waiter@123", role: "waiter", phone: "+91 90000 00007" },
  { full_name: "Diego Line", email: "chef2@restaurantos.test", password: "Chef@123", role: "chef", phone: "+91 90000 00008" },
  { full_name: "Farah Front", email: "cashier2@restaurantos.test", password: "Cashier@123", role: "cashier", phone: "+91 90000 00009" },
];

async function seedUsers(client, ctx) {
  ctx.users = { byRole: {}, waiters: [], chefs: [], cashiers: [], all: [] };

  for (const person of STAFF) {
    const password_hash = await hashPassword(person.password);
    const { id } = await insert(client, "users", {
      full_name: person.full_name,
      email: person.email,
      password_hash,
      role: person.role,
      phone: person.phone,
      is_active: true,
    });

    ctx.users.all.push(id);
    if (!ctx.users.byRole[person.role]) ctx.users.byRole[person.role] = id;
    if (person.role === "waiter") ctx.users.waiters.push(id);
    if (person.role === "chef") ctx.users.chefs.push(id);
    if (person.role === "cashier") ctx.users.cashiers.push(id);
  }

  // Convenience handles for single-role actors used as created_by.
  ctx.users.owner = ctx.users.byRole.owner;
  ctx.users.manager = ctx.users.byRole.manager;
  ctx.users.storeManager = ctx.users.byRole.store_manager;
}

module.exports = { seedUsers };
