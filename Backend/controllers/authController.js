import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import { JWT_SECRET } from '../middleware/auth.js';

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '12h';

export async function login(req, res, next) {
  try {
    const { username, password } = req.body || {};

    // Strict type check to prevent NoSQL injection object payloads (e.g. {"$ne": null})
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'Username and password must be valid text strings' });
    }

    if (!username.trim() || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const normalizedUsername = username.trim().toLowerCase();
    const user = await User.findOne({ username: normalizedUsername }).select('+passwordHash');

    if (!user) {
      console.warn(`[auth] failed login attempt: unknown username="${normalizedUsername}" from IP=${req.ip}`);
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    if (!user.active) {
      console.warn(`[auth] rejected login attempt on deactivated account: username="${normalizedUsername}" from IP=${req.ip}`);
      return res.status(403).json({ error: 'Account is deactivated. Please contact an administrator.' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      console.warn(`[auth] failed login attempt: incorrect password for username="${normalizedUsername}" from IP=${req.ip}`);
      return res.status(400).json({ error: 'Invalid username or password' });
    }

    const token = jwt.sign(
      { userId: user._id, role: user.role, username: user.username },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      token,
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        fullName: user.fullName,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function logout(req, res) {
  res.json({ message: 'Logged out successfully' });
}

export async function getMe(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    res.json({
      user: {
        id: req.user._id,
        username: req.user.username,
        role: req.user.role,
        fullName: req.user.fullName,
      },
    });
  } catch (err) {
    next(err);
  }
}
