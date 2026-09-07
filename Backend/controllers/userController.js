import bcrypt from 'bcryptjs';
import User from '../models/User.js';

export async function getUsers(req, res, next) {
  try {
    const users = await User.find({})
      .select('-passwordHash')
      .sort({ createdAt: -1 });
    res.json({ users });
  } catch (err) {
    next(err);
  }
}

export async function createUser(req, res, next) {
  try {
    const { username, password, role, fullName } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    const normalizedUsername = String(username).trim().toLowerCase();

    const existing = await User.findOne({ username: normalizedUsername });
    if (existing) {
      return res.status(400).json({ error: `Username "${normalizedUsername}" is already taken` });
    }

    const validRole = role === 'admin' ? 'admin' : 'staff';
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await User.create({
      username: normalizedUsername,
      passwordHash,
      role: validRole,
      fullName: (fullName || '').trim(),
      active: true,
    });

    res.status(201).json({
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        fullName: user.fullName,
        active: user.active,
        createdAt: user.createdAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function updateUser(req, res, next) {
  try {
    const { id } = req.params;
    const { role, fullName, active, password } = req.body || {};

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Safety check: Prevent deactivating or demoting the last active admin
    if (user.role === 'admin' && (active === false || (role && role !== 'admin'))) {
      const activeAdminCount = await User.countDocuments({
        _id: { $ne: user._id },
        role: 'admin',
        active: true,
      });

      if (activeAdminCount === 0) {
        return res.status(400).json({
          error: 'Cannot deactivate or demote the only remaining active admin account.',
        });
      }
    }

    if (typeof active === 'boolean') {
      user.active = active;
    }
    if (role && ['admin', 'staff'].includes(role)) {
      user.role = role;
    }
    if (typeof fullName === 'string') {
      user.fullName = fullName.trim();
    }
    if (password && password.trim().length >= 6) {
      const salt = await bcrypt.genSalt(10);
      user.passwordHash = await bcrypt.hash(password.trim(), salt);
    }

    await user.save();

    res.json({
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        fullName: user.fullName,
        active: user.active,
        updatedAt: user.updatedAt,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteUser(req, res, next) {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.role === 'admin') {
      const activeAdminCount = await User.countDocuments({
        _id: { $ne: user._id },
        role: 'admin',
        active: true,
      });

      if (activeAdminCount === 0) {
        return res.status(400).json({
          error: 'Cannot delete the only remaining active admin account.',
        });
      }
    }

    await User.findByIdAndDelete(id);
    res.json({ message: 'User deleted successfully' });
  } catch (err) {
    next(err);
  }
}
