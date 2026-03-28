import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';

// Singleton client
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface TelemetryConfig {
    machineId: string;
    walletAddress?: string;
    installationId?: string;
}

let config: TelemetryConfig | null = null;

// Initialize telemetry on extension activation
export async function initializeTelemetry(machineId: string, walletAddress?: string) {
    if (!supabaseUrl || !supabaseAnonKey) {
        console.warn('Supabase credentials missing. Telemetry disabled.');
        return;
    }

    try {
        // Upsert installation record
        const { data, error } = await supabase
            .from('opencode_installations')
            .upsert({
                machine_id: machineId,
                wallet_address: walletAddress || null,
            }, { onConflict: 'machine_id' })
            .select('id')
            .single();

        if (error) throw error;

        config = {
            machineId,
            walletAddress,
            installationId: data.id,
        };
        console.log(`Telemetry initialized. ID: ${data.id}`);
    } catch (err) {
        console.error('Failed to initialize telemetry:', err);
    }
}

// Track an event (e.g. ad impression)
export async function trackAdEvent(campaignId: string, advertiser: string, eventType: 'impression' | 'click' | 'time_spent', metadata: any = {}) {
    if (!config?.installationId || !supabaseUrl) return;

    try {
        await supabase
            .from('ad_events')
            .insert({
                installation_id: config.installationId,
                campaign_id: campaignId,
                advertiser,
                event_type: eventType,
                metadata
            });
    } catch (err) {
        console.error('Failed to track ad event:', err);
    }
}
