import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Please provide a name'],
      trim: true,
      maxlength: [50, 'Name cannot be more than 50 characters'],
    },
    email: {
      type: String,
      required: [true, 'Please provide an email'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        'Please provide a valid email',
      ],
    },
    password: {
      type: String,
      required: [true, 'Please provide a password'],
      minlength: [6, 'Password must be at least 6 characters'],
      select: false, // Don't return password by default
    },
    role: {
      type: String,
      enum: ['admin', 'salesperson', 'mechanic', 'customer'],
      default: 'customer',
    },
    branch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Branch',
      required: function() {
        // Branch is required for salesperson and mechanic only
        // Admin and customer don't need a branch assignment
        return this.role === 'salesperson' || this.role === 'mechanic';
      },
      validate: {
        validator: async function(branchId) {
          // Skip validation if no branchId (admin/customer can have no branch)
          if (!branchId) return true;
          
          // Dynamically import Branch model to avoid circular dependency
          const { default: Branch } = await import('./Branch.js');
          const branch = await Branch.findById(branchId);
          return branch !== null;
        },
        message: 'Branch does not exist'
      }
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    permissions: [{
      type: String,
      enum: [
        'view_all_branches',
        'manage_users',
        'manage_products',
        'manage_stock',
        'process_sales',
        'process_services',
        'view_reports',
        'manage_finances'
      ]
    }],
    refreshToken: {
      type: String,
      select: false,
    },
    resetPasswordToken: {
      type: String,
      select: false,
    },
    resetPasswordExpire: {
      type: Date,
      select: false,
    },
    // When the password last changed. Read by `protect` to reject access tokens
    // that were minted before it, which is the only way to end a session that
    // is already holding a signed 7-day token.
    //
    // Deliberately NOT `select: false`: `protect` loads the user on every
    // authenticated request with `.select('-password')`, and a field it cannot
    // see is a check that silently never fires.
    passwordChangedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Hash password before saving, and record when it changed.
//
// Both live in the same hook on purpose. Every path that changes a password goes
// through here, so a future one cannot forget to stamp the time: the reset flow,
// the admin change, and anything added later.
userSchema.pre('save', async function () {
  // Only hash if password is modified
  if (!this.isModified('password')) {
    return;
  }

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);

  // Not stamped on creation. A brand-new user has no outstanding tokens to
  // invalidate, and leaving the field unset keeps "never changed" distinct from
  // "changed at signup", which is what lets a token minted before this shipped
  // stay valid until its owner changes their password.
  if (!this.isNew) {
    this.passwordChangedAt = new Date();
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Method to generate reset password token
userSchema.methods.getResetPasswordToken = function () {
  // Generate token
  const resetToken = crypto.randomBytes(32).toString('hex');

  // Hash token and set to resetPasswordToken field
  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  // Set expire time (10 minutes)
  this.resetPasswordExpire = Date.now() + 10 * 60 * 1000;

  return resetToken;
};

const User = mongoose.model('User', userSchema);

export default User;
