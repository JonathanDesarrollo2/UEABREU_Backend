export function getErrorLocation(filename: string): string {
    try {
        const error = new Error();
        const stack = error.stack?.split('\n') || [];
        
        // Buscar la línea relevante en el stack trace
        for (let i = 2; i < stack.length; i++) {
            const line = stack[i].trim();
            if (line.includes(filename)) {
                return line;
            }
        }
        
        return `File: ${filename}, Line: Unknown`;
    } catch {
        return `File: ${filename}, Line: Unknown`;
    }
}