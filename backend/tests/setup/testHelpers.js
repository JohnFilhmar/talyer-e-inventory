import User from '../../src/models/User.js';
import { generateToken, generateRefreshToken } from '../../src/utils/jwt.js';

/**
 * Create a test user with JWT tokens
 * @param {Object} userData - User data
 * @returns {Promise<Object>} Created user with tokens
 */
const createTestUser = async (userData = {}) => {
  const defaultUserData = {
    name: 'Test User',
    email: 'test@example.com',
    password: 'password123',
    role: 'admin', // Default to admin to avoid branch requirement in tests
    isActive: true,
  };

  const user = await User.create({
    ...defaultUserData,
    ...userData,
  });

  // Generate JWT tokens
  const accessToken = generateToken(user._id);
  const refreshToken = generateRefreshToken(user._id);

  // Save refresh token to user
  user.refreshToken = refreshToken;
  await user.save();

  return {
    user,
    token: accessToken,
    refreshToken
  };
};

/**
 * Create an admin user with JWT tokens
 * @returns {Promise<Object>} Created admin user with tokens
 */
const createTestAdmin = async () => {
  return createTestUser({
    name: 'Admin User',
    email: 'admin@example.com',
    role: 'admin',
  });
};

/**
 * Create a salesperson user with JWT tokens
 * @param {String} branchId - Optional branch ID
 * @returns {Promise<Object>} Created salesperson user with tokens
 */
const createTestSalesperson = async (branchId = null) => {
  const userData = {
    name: 'Sales Person',
    email: 'sales@example.com',
    role: 'salesperson',
  };
  
  if (branchId) {
    userData.branch = branchId;
  }
  
  return createTestUser(userData);
};

/**
 * Create a mechanic user with JWT tokens
 * @param {String} branchId - Optional branch ID
 * @param {Object} userData - Optional user data overrides
 * @returns {Promise<Object>} Created mechanic user with tokens
 */
const createTestMechanic = async (branchId = null, userData = {}) => {
  return createTestUser({
    name: 'Mechanic User',
    email: 'mechanic@example.com',
    role: 'mechanic',
    branch: branchId,
    ...userData
  });
};

export {
  createTestUser,
  createTestAdmin,
  createTestSalesperson,
  createTestMechanic,
};
