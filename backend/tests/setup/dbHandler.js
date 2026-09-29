import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

let mongoServer;

/**
 * Connect to an in-memory single-node replica set.
 *
 * A replica set rather than a standalone because production runs one (GAP-046)
 * and the stock-mutating controllers run inside transactions, which a
 * standalone rejects. wiredTiger is the engine that supports them.
 */
const connect = async () => {
  // Close any existing connections
  await mongoose.disconnect();

  mongoServer = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  const uri = mongoServer.getUri();

  await mongoose.connect(uri);
};

/**
 * Drop database, close the connection and stop mongod
 */
const closeDatabase = async () => {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
};

/**
 * Remove all the data for all db collections
 */
const clearDatabase = async () => {
  if (mongoose.connection.readyState !== 0) {
    const collections = mongoose.connection.collections;

    for (const key in collections) {
      const collection = collections[key];
      await collection.deleteMany();
    }
  }
};

export {
  connect,
  closeDatabase,
  clearDatabase,
};
