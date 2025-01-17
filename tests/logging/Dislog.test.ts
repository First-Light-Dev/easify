import axios from 'axios';
import Dislog from '../../src/logging/Dislog';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Dislog', () => {
    const webhook = 'https://discord.webhook.url';
    const userID = '123456789';
    let dislog: Dislog;

    beforeEach(() => {
        // Reset the singleton state before each test
        Dislog['isInit'] = false;
        (Dislog['instance'] as any) = null;
        // Clear mock calls
        mockedAxios.post.mockClear();
    });

    describe('initialize', () => {
        it('should create a new instance on first call', () => {
            const instance = Dislog.initialize(webhook, userID);
            expect(instance).toBeInstanceOf(Dislog);
            expect(instance.webhook).toBe(webhook);
            expect(instance.userID).toBe(userID);
        });

        it('should return the same instance on subsequent calls', () => {
            const instance1 = Dislog.initialize(webhook, userID);
            const instance2 = Dislog.initialize('different-webhook', 'different-id');
            expect(instance1).toBe(instance2);
            // Should keep original values
            expect(instance2.webhook).toBe(webhook);
            expect(instance2.userID).toBe(userID);
        });
    });

    describe('getInstance', () => {
        it('should throw an error if not initialized', () => {
            expect(() => Dislog.getInstance()).toThrow('Dislog not initialized. Call initialize() first.');
        });
    });

    describe('log', () => {
        it('should send a message to Discord webhook', async () => {
            dislog = Dislog.initialize(webhook, userID);
            mockedAxios.post.mockResolvedValueOnce({});
            const message = 'Test message';
            
            await dislog.log(message);

            expect(mockedAxios.post).toHaveBeenCalledWith(webhook, {
                content: message
            });
        });

        it('should handle errors gracefully', async () => {
            dislog = Dislog.initialize(webhook, userID);
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
            mockedAxios.post.mockRejectedValueOnce(new Error('Network error'));
            
            await dislog.log('Test message');

            expect(consoleErrorSpy).toHaveBeenCalled();
            consoleErrorSpy.mockRestore();
        });
    });

    describe('alert', () => {
        it('should send an alert message with user mention to Discord webhook', async () => {
            dislog = Dislog.initialize(webhook, userID);
            mockedAxios.post.mockResolvedValueOnce({});
            const message = 'Test alert';
            
            await dislog.alert(message);

            expect(mockedAxios.post).toHaveBeenCalledWith(webhook, {
                content: `<@${userID}> \n ${message}`
            });
        });

        it('should handle errors gracefully', async () => {
            dislog = Dislog.initialize(webhook, userID);
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
            mockedAxios.post.mockRejectedValueOnce(new Error('Network error'));
            
            await dislog.alert('Test alert');

            expect(consoleErrorSpy).toHaveBeenCalled();
            consoleErrorSpy.mockRestore();
        });
    });
});
