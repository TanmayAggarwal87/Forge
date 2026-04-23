import { BadRequestException } from '@nestjs/common';

export function requireString(
  value: unknown,
  fieldName: string,
  maxLength = 120,
): string {
  if (typeof value !== 'string') {
    throw new BadRequestException(`${fieldName} must be a string.`);
  }

  const trimmedValue = value.trim();
  if (!trimmedValue) {
    throw new BadRequestException(`${fieldName} is required.`);
  }

  if (trimmedValue.length > maxLength) {
    throw new BadRequestException(
      `${fieldName} must be ${maxLength} characters or fewer.`,
    );
  }

  return trimmedValue;
}

export function requireEmail(value: unknown, fieldName: string): string {
  const email = requireString(value, fieldName, 254).toLowerCase();
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(email)) {
    throw new BadRequestException(`${fieldName} must be a valid email.`);
  }

  return email;
}

export function requirePassword(
  value: unknown,
  fieldName = 'password',
): string {
  const password = requireString(value, fieldName, 128);

  if (password.length < 8) {
    throw new BadRequestException(
      `${fieldName} must be at least 8 characters.`,
    );
  }

  return password;
}
