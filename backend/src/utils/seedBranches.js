const mongoose = require('mongoose');
const Branch = require('../models/Branch');

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

seedBranches();
