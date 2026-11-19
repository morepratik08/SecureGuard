import readline from 'node:readline';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

export class InteractivePromptError extends Error {}

export function promptText(question) {
  const prompt = createInterface({ input: stdin, output: stdout });
  return prompt.question(question).finally(() => prompt.close());
}

export function promptHiddenPassword(question) {
  if (!stdin.isTTY || typeof stdin.setRawMode !== 'function') {
    return Promise.reject(new InteractivePromptError('A real interactive terminal is required to enter the hidden password.'));
  }

  readline.emitKeypressEvents(stdin);
  stdout.write(question);
  stdin.setRawMode(true);
  stdin.resume();

  return new Promise((resolve, reject) => {
    let password = '';

    const cleanup = () => {
      stdin.removeListener('keypress', onKeypress);
      process.removeListener('SIGINT', onInterrupt);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
    };

    const onInterrupt = () => {
      cleanup();
      reject(new InteractivePromptError('Prompt cancelled.'));
    };

    const onKeypress = (character, key = {}) => {
      if (key.ctrl && key.name === 'c') {
        cleanup();
        reject(new InteractivePromptError('Prompt cancelled.'));
        return;
      }
      if (key.name === 'return' || key.name === 'enter') {
        cleanup();
        resolve(password);
        return;
      }
      if (key.name === 'backspace') {
        password = Array.from(password).slice(0, -1).join('');
      } else if (!key.ctrl && !key.meta && character) {
        password += character;
      }
    };

    stdin.on('keypress', onKeypress);
    process.once('SIGINT', onInterrupt);
  });
}
