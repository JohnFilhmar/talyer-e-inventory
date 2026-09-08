import 'dotenv/config';
import path from 'path';
import { pathToFileURL } from 'url';
import mongoose from 'mongoose';
import Branch from '../models/Branch.js';

const branches = [
  {
    name: 'Main Branch - Manila',
    code: 'MNL-MAIN',
    address: {
      street: '123 EDSA Avenue',
      city: 'Manila',
      province: 'Metro Manila',
      postalCode: '1000',
      country: 'Philippines'
    },
    contact: {
      phone: '+63 2 1234 5678',
      email: 'manila@motorparts.com'
    },
    settings: {
      taxRate: 12,
      currency: 'PHP',
      timezone: 'Asia/Manila',
      businessHours: {
        monday: { open: '08:00', close: '18:00' },
        tuesday: { open: '08:00', close: '18:00' },
        wednesday: { open: '08:00', close: '18:00' },
        thursday: { open: '08:00', close: '18:00' },
        friday: { open: '08:00', close: '18:00' },
        saturday: { open: '08:00', close: '17:00' },
        sunday: { open: '09:00', close: '15:00' }
      }
    },
    description: 'Main headquarters and flagship store'
  },
  {
    name: 'Quezon City Branch',
    code: 'QC-001',
    address: {
      street: '456 Commonwealth Avenue',
      city: 'Quezon City',
      province: 'Metro Manila',
      postalCode: '1100',
      country: 'Philippines'
    },
    contact: {
      phone: '+63 2 8765 4321',
      email: 'qc@motorparts.com'
    },
    settings: {
      taxRate: 12,
      currency: 'PHP',
      timezone: 'Asia/Manila',
      businessHours: {
        monday: { open: '08:00', close: '18:00' },
        tuesday: { open: '08:00', close: '18:00' },
        wednesday: { open: '08:00', close: '18:00' },
        thursday: { open: '08:00', close: '18:00' },
        friday: { open: '08:00', close: '18:00' },
        saturday: { open: '08:00', close: '17:00' },
        sunday: { open: null, close: null }
      }
    },
    description: 'Quezon City branch serving northern Metro Manila'
  },
  {
    name: 'Cebu Branch',
    code: 'CEB-001',
    address: {
      street: '789 Osmena Boulevard',
      city: 'Cebu City',
      province: 'Cebu',
      postalCode: '6000',
      country: 'Philippines'
    },
    contact: {
      phone: '+63 32 234 5678',
      email: 'cebu@motorparts.com'
    },
    settings: {
      taxRate: 12,
      currency: 'PHP',
      timezone: 'Asia/Manila',
      businessHours: {
        monday: { open: '08:00', close: '18:00' },
        tuesday: { open: '08:00', close: '18:00' },
        wednesday: { open: '08:00', close: '18:00' },
        thursday: { open: '08:00', close: '18:00' },
        friday: { open: '08:00', close: '18:00' },
        saturday: { open: '08:00', close: '17:00' },
        sunday: { open: null, close: null }
      }
    },
    description: 'Cebu branch serving Visayas region'
  }
];

const seedBranches = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Clear existing branches
    await Branch.deleteMany({});
    console.log('Cleared existing branches');

    // Insert new branches
    const createdBranches = await Branch.insertMany(branches);
    console.log(`✅ Seeded ${createdBranches.length} branches successfully`);
    
    createdBranches.forEach(branch => {
      console.log(`   - ${branch.name} (${branch.code})`);
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding branches:', error);
    process.exit(1);
  }
};

/**
 * Redact credentials from a Mongo URI so the target can be printed safely.
 * Returns a coarse description rather than throwing on an unparseable value.
 */
const describeTarget = (uri) => {
  if (!uri) return '(MONGODB_URI is not set)';
  try {
    const parsed = new URL(uri);
    return `${parsed.host}${parsed.pathname}`;
  } catch {
    return '(unparseable MONGODB_URI)';
  }
};

/**
 * This module used to end in a bare `seedBranches()`, so merely importing it
 * ran `Branch.deleteMany({})` against whatever `MONGODB_URI` pointed at. Its
 * safety rested entirely on nobody ever importing the file.
 *
 * Three guards now stand between an import and a deletion: the module must be
 * the process entry point, `--confirm` must be passed, and a `production`
 * NODE_ENV additionally needs `--force-production`. The resolved target is
 * printed before anything is deleted so an operator can abort.
 */
const isEntryPoint = () => {
  const invoked = process.argv[1];
  if (!invoked) return false;
  return import.meta.url === pathToFileURL(path.resolve(invoked)).href;
};

const usage = () => {
  console.error('Refusing to run: seedBranches DELETES ALL EXISTING BRANCHES.');
  console.error('');
  console.error('  node src/utils/seedBranches.js --confirm');
  console.error('');
  console.error('Target database:', describeTarget(process.env.MONGODB_URI));
  console.error('Add --force-production to allow this with NODE_ENV=production.');
};

if (isEntryPoint()) {
  const args = process.argv.slice(2);
  const confirmed = args.includes('--confirm');
  const forcedProduction = args.includes('--force-production');

  if (!confirmed) {
    usage();
    process.exit(1);
  } else if (process.env.NODE_ENV === 'production' && !forcedProduction) {
    console.error('Refusing to run against NODE_ENV=production without --force-production.');
    console.error('Target database:', describeTarget(process.env.MONGODB_URI));
    process.exit(1);
  } else {
    console.log('Seeding branches. This deletes every existing branch first.');
    console.log('Target database:', describeTarget(process.env.MONGODB_URI));
    seedBranches();
  }
}

export { seedBranches, branches };
