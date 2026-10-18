import {hashPassword} from './auth.js';
// Pipe a password via stdin from a password manager or enter it in a private
// terminal. Never pass passwords as command-line arguments or commit the output.
let input='';for await(const chunk of process.stdin)input+=chunk;input=input.trimEnd();if(input.length<16){console.error('Use a unique password of at least 16 characters.');process.exit(1);}console.log(hashPassword(input));
