import jwt from 'jsonwebtoken';

const DEVICE_JWT_SECRET = process.env.DEVICE_JWT_SECRET || 'CHANGE_THIS_IN_PRODUCTION_DEVICE_SECRET_2026';

const authenticateDevice = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (!authHeader) {
            return res.status(401).json({ message: 'authorization token is required' });
        }
        
        const parts = authHeader.split(' ');
        if (parts.length !== 2 || parts[0] !== 'Bearer') {
            return res.status(401).json({ message: 'invalid authorization format' });
        }
        
        const token = parts[1];
        
        let decoded;
        try {
            decoded = jwt.verify(token, DEVICE_JWT_SECRET);
        } catch (jwtError) {
            if (jwtError.name === 'TokenExpiredError') {
                return res.status(401).json({ message: 'device token expired' });
            }
            return res.status(401).json({ message: 'invalid device token' });
        }
        
        // Accept both external_device_id (old) and device_code (new)
        const deviceCode = decoded.external_device_id || decoded.device_code;
        
        if (!decoded.device_id || !deviceCode || !decoded.tenant_id) {
            return res.status(401).json({ message: 'invalid token claims' });
        }
        
        req.device = {
            id: decoded.device_id,
            pk_device_id: decoded.device_id,
            external_device_id: deviceCode,
            code: deviceCode,
            tenant_id: decoded.tenant_id,
            type: decoded.type
        };
        
        next();
        
    } catch (error) {
        console.error('[authenticateDevice] Error:', error);
        res.status(500).json({ message: 'internal server error during authentication' });
    }
};

export default authenticateDevice;
