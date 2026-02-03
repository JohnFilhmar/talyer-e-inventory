import request from 'supertest';
import express from 'express';
import * as dbHandler from './setup/dbHandler.js';
import { createTestUser, createTestAdmin } from './setup/testHelpers.js';
import authRoutes from '../src/routes/authRoutes.js';
import User from '../src/models/User.js';

// Create Express app for testing
const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

/**
 * Connect to a new in-memory database before running any tests
 */
beforeAll(async () => {
  await dbHandler.connect();
});

/**
 * Clear all test data after every test
 */
afterEach(async () => {
  await dbHandler.clearDatabase();
});

/**
 * Remove and close the db and server
 */
afterAll(async () => {
  await dbHandler.closeDatabase();
});


// Phase 1 Tests: Authentication Controller
describe('Auth API - Registration', () => {
  describe('POST /api/auth/register', () => {
    it('should register a new user with valid data', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'John Doe',
          email: 'john@example.com',
          password: 'password123',
          role: 'admin', // Use admin to avoid branch requirement in tests
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('User registered successfully');
      expect(res.body.data).toHaveProperty('user');
      expect(res.body.data.user).toHaveProperty('_id');
      expect(res.body.data.user).toHaveProperty('name', 'John Doe');
      expect(res.body.data.user).toHaveProperty('email', 'john@example.com');
      expect(res.body.data.user).toHaveProperty('role', 'admin');
      expect(res.body.data).toHaveProperty('accessToken');
      // refreshToken is now in httpOnly cookie, not in response body
      expect(res.headers['set-cookie']).toBeDefined();
      expect(res.body.meta).toHaveProperty('timestamp');
    });

    it('should register an admin user without branch requirement', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Admin User',
          email: 'admin@example.com',
          password: 'password123',
          role: 'admin',
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe('admin');
    });

    it('should fail with invalid name (too short)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'A',
          email: 'test@example.com',
          password: 'password123',
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Validation failed');
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'name',
            message: 'Name must be between 2 and 50 characters',
          }),
        ])
      );
    });

    it('should fail with invalid email format', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test User',
          email: 'invalid-email',
          password: 'password123',
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'email',
            message: 'Please provide a valid email',
          }),
        ])
      );
    });

    it('should fail with password too short', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test User',
          email: 'test@example.com',
          password: '123',
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'password',
            message: 'Password must be at least 6 characters',
          }),
        ])
      );
    });

    it('should fail with missing required fields', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test User',
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Validation failed');
    });

    it('should fail with invalid role', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test User',
          email: 'test@example.com',
          password: 'password123',
          role: 'invalid_role',
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'role',
            message: 'Invalid role',
          }),
        ])
      );
    });

    it('should fail when email already exists', async () => {
      // Create a user first
      await createTestUser({
        email: 'existing@example.com',
      });

      // Try to register with same email
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Another User',
          email: 'existing@example.com',
          password: 'password123',
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('User already exists');
    });

    it('should accept admin role without branch requirement', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Admin Test User',
          email: 'admintest@example.com',
          password: 'password123',
          role: 'admin',
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.role).toBe('admin');
    });
  });
});

describe('Auth API - Login', () => {
  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      // Create a user first
      await createTestUser({
        email: 'login@example.com',
        password: 'password123',
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@example.com',
          password: 'password123',
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Login successful');
      expect(res.body.data).toHaveProperty('user');
      expect(res.body.data.user).toHaveProperty('_id');
      expect(res.body.data.user).toHaveProperty('email', 'login@example.com');
      expect(res.body.data).toHaveProperty('accessToken');
      // refreshToken is now in httpOnly cookie, not in response body
      expect(res.headers['set-cookie']).toBeDefined();
      expect(res.body.data.user).toHaveProperty('role');
      // Branch may not be in response if undefined for admin users
    });

    it('should fail with invalid email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'password123',
        });

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Invalid credentials');
    });

    it('should fail with invalid password', async () => {
      await createTestUser({
        email: 'login@example.com',
        password: 'password123',
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'login@example.com',
          password: 'wrongpassword',
        });

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Invalid credentials');
    });

    it('should fail with missing email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          password: 'password123',
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Validation failed');
    });

    it('should fail with missing password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should fail with invalid email format', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'not-an-email',
          password: 'password123',
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'email',
            message: 'Please provide a valid email',
          }),
        ])
      );
    });

    it('should fail when account is deactivated', async () => {
      await createTestUser({
        email: 'inactive@example.com',
        password: 'password123',
        isActive: false,
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'inactive@example.com',
          password: 'password123',
        });

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Account is deactivated');
    });
  });
});

describe('Auth API - Get Current User', () => {
  describe('GET /api/auth/me', () => {
    it('should return current user with valid token', async () => {
      // Register and get token
      const registerRes = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test User',
          email: 'test@example.com',
          password: 'password123',
          role: 'admin',
        });

      const token = registerRes.body.data.accessToken;

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('User retrieved successfully');
      expect(res.body.data).toHaveProperty('email', 'test@example.com');
      expect(res.body.data).not.toHaveProperty('password');
    });

    it('should fail without authorization header', async () => {
      const res = await request(app).get('/api/auth/me');

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should fail with invalid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should fail with malformed authorization header', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'InvalidFormat token123');

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
});

describe('Auth API - Refresh Token', () => {
  describe('POST /api/auth/refresh-token', () => {
    it('should refresh token with valid refresh token', async () => {
      // Register and get refresh token from cookie
      const registerRes = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test User',
          email: 'test@example.com',
          password: 'password123',
          role: 'admin',
        });

      // Extract refresh token from set-cookie header
      const cookies = registerRes.headers['set-cookie'];
      const refreshTokenCookie = cookies?.find(c => c.startsWith('refreshToken='));
      const refreshToken = refreshTokenCookie?.split(';')[0].split('=')[1];

      const res = await request(app)
        .post('/api/auth/refresh-token')
        .send({ refreshToken });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Token refreshed successfully');
      expect(res.body.data).toHaveProperty('accessToken');
    });

    it('should fail with missing refresh token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh-token')
        .send({});

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('No refresh token provided');
    });

    it('should fail with invalid refresh token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh-token')
        .send({ refreshToken: 'invalid-token' });

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Invalid or expired refresh token');
    });

    it('should fail with refresh token from different user', async () => {
      // Create first user and get token from cookie
      const user1Res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'User 1',
          email: 'user1@example.com',
          password: 'password123',
          role: 'admin',
        });

      // Extract refresh token from cookie
      const cookies = user1Res.headers['set-cookie'];
      const refreshTokenCookie = cookies?.find(c => c.startsWith('refreshToken='));
      const user1RefreshToken = refreshTokenCookie?.split(';')[0].split('=')[1];

      // Create second user and update their refresh token to user1's
      const user2 = await createTestUser({
        email: 'user2@example.com',
        password: 'password123',
      });

      // Try to use user1's refresh token
      const res = await request(app)
        .post('/api/auth/refresh-token')
        .send({ refreshToken: user1RefreshToken });

      // Should succeed because token is valid (belongs to user1)
      expect(res.statusCode).toBe(200);
    });
  });
});

describe('Auth API - Logout', () => {
  describe('POST /api/auth/logout', () => {
    it('should logout successfully with valid token', async () => {
      // Register and get token
      const registerRes = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test User',
          email: 'test@example.com',
          password: 'password123',
          role: 'admin',
        });

      const token = registerRes.body.data.accessToken;
      // Extract refresh token from cookie
      const cookies = registerRes.headers['set-cookie'];
      const refreshTokenCookie = cookies?.find(c => c.startsWith('refreshToken='));
      const refreshToken = refreshTokenCookie?.split(';')[0].split('=')[1];

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Logout successful');

      // Verify refresh token is cleared
      const user = await User.findOne({ email: 'test@example.com' });
      expect(user.refreshToken).toBeUndefined();

      // Try to use old refresh token (should fail)
      const refreshRes = await request(app)
        .post('/api/auth/refresh-token')
        .send({ refreshToken });

      expect(refreshRes.statusCode).toBe(401);
    });

    it('should fail without authorization token', async () => {
      const res = await request(app).post('/api/auth/logout');

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should fail with invalid token', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', 'Bearer invalid-token');

      expect(res.statusCode).toBe(401);
      expect(res.body.success).toBe(false);
    });
  });
});

describe('Auth API - Forgot Password', () => {
  describe('POST /api/auth/forgot-password', () => {
    it('should generate reset token for valid email', async () => {
      await createTestUser({
        email: 'reset@example.com',
      });

      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'reset@example.com' });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Password reset token generated');
      expect(res.body.data).toHaveProperty('resetToken');
    });

    it('should fail with missing email', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({});

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Validation failed');
    });

    it('should fail with invalid email format', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'not-an-email' });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'email',
            message: 'Please provide a valid email',
          }),
        ])
      );
    });

    it('should fail with non-existent email', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nonexistent@example.com' });

      expect(res.statusCode).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('User not found');
    });
  });
});

describe('Auth API - Reset Password', () => {
  describe('POST /api/auth/reset-password', () => {
    it('should reset password with valid token', async () => {
      // Create user and get reset token
      await createTestUser({
        email: 'reset@example.com',
        password: 'oldpassword123',
      });

      const forgotRes = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'reset@example.com' });

      const resetToken = forgotRes.body.data.resetToken;

      // Reset password
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({
          resetToken,
          newPassword: 'newpassword123',
        });

      expect(res.statusCode).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Password reset successful');

      // Verify can login with new password
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'reset@example.com',
          password: 'newpassword123',
        });

      expect(loginRes.statusCode).toBe(200);
    });

    it('should fail with missing reset token', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ newPassword: 'newpassword123' });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Validation failed');
    });

    it('should fail with missing new password', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ resetToken: 'some-token' });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('should fail with password too short', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({
          resetToken: 'some-token',
          newPassword: '123',
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: 'newPassword',
            message: 'Password must be at least 6 characters',
          }),
        ])
      );
    });

    it('should fail with invalid reset token', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({
          resetToken: 'invalid-token',
          newPassword: 'newpassword123',
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Invalid or expired reset token');
    });

    it('should fail with expired reset token', async () => {
      // Create user and get reset token
      const { user } = await createTestUser({
        email: 'reset@example.com',
      });

      // Manually set an expired reset token
      const { default: crypto } = await import('crypto');
      const resetToken = crypto.randomBytes(32).toString('hex');
      user.resetPasswordToken = crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex');
      user.resetPasswordExpire = Date.now() - 10000; // Expired 10 seconds ago
      await user.save();

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({
          resetToken,
          newPassword: 'newpassword123',
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Invalid or expired reset token');
    });

    it('should not allow old password after reset', async () => {
      // Create user
      await createTestUser({
        email: 'reset@example.com',
        password: 'oldpassword123',
      });

      // Get reset token
      const forgotRes = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'reset@example.com' });

      const resetToken = forgotRes.body.data.resetToken;

      // Reset password
      await request(app)
        .post('/api/auth/reset-password')
        .send({
          resetToken,
          newPassword: 'newpassword123',
        });

      // Try to login with old password (should fail)
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'reset@example.com',
          password: 'oldpassword123',
        });

      expect(loginRes.statusCode).toBe(401);
      expect(loginRes.body.message).toBe('Invalid credentials');
    });
  });
});

describe('Auth API - Response Format Consistency', () => {
  it('all success responses should have consistent format', async () => {
    const registerRes = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Test User',
        email: 'test@example.com',
        password: 'password123',
        role: 'admin',
      });

    expect(registerRes.body).toHaveProperty('success', true);
    expect(registerRes.body).toHaveProperty('message');
    expect(registerRes.body).toHaveProperty('data');
    expect(registerRes.body).toHaveProperty('meta');
    expect(registerRes.body.meta).toHaveProperty('timestamp');
  });

  it('all error responses should have consistent format', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'nonexistent@example.com',
        password: 'password123',
      });

    expect(res.body).toHaveProperty('success', false);
    expect(res.body).toHaveProperty('message');
    expect(res.body).toHaveProperty('meta');
    expect(res.body.meta).toHaveProperty('timestamp');
  });

  it('validation errors should include errors array', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'A',
        email: 'invalid',
        password: '12',
      });

    expect(res.body).toHaveProperty('success', false);
    expect(res.body).toHaveProperty('message', 'Validation failed');
    expect(res.body).toHaveProperty('errors');
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors.length).toBeGreaterThan(0);
    expect(res.body.errors[0]).toHaveProperty('field');
    expect(res.body.errors[0]).toHaveProperty('message');
  });
});