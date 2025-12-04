import bcrypt from 'bcrypt'

export const HashPass = async (key: string) => {
    const salt = await bcrypt.genSalt(10); 
    return await bcrypt.hash(key, salt);
};
export const comparePass = async (keyFront: string, keyDB: string) => {
    return await bcrypt.compare(keyFront,keyDB);
};
