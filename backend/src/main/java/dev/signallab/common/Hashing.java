package dev.signallab.common;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

public final class Hashing {

    private static final SecureRandom RANDOM = new SecureRandom();

    private Hashing() {}

    public static String sha256Hex(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Constant-time comparison of a raw secret against a stored sha-256 hex digest. */
    public static boolean matches(String raw, String storedHex) {
        if (raw == null || storedHex == null) {
            return false;
        }
        return MessageDigest.isEqual(
                sha256Hex(raw).getBytes(StandardCharsets.US_ASCII), storedHex.getBytes(StandardCharsets.US_ASCII));
    }

    /** 256-bit URL-safe random token. */
    public static String randomToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
}
