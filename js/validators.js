// js/validators.js
import { supabase } from './supabaseClient.js';
import Swal from 'https://cdn.jsdelivr.net/npm/sweetalert2@11/+esm';

export const validateRefereeAvailability = async (refereeId, matchDate, matchTime, excludeMatchId = null) => {
    if (!refereeId) return { valid: true };

    try {
        // Check suspension
        const { data: referee, error: refError } = await supabase
            .from('referees')
            .select('is_suspended, suspension_until, full_name')
            .eq('id', refereeId)
            .single();

        if (refError) throw refError;

        if (referee.is_suspended) {
            return {
                valid: false,
                error: `الحكم ${referee.full_name} موقوف حالياً`,
                type: 'suspension'
            };
        }

        if (referee.suspension_until && new Date(referee.suspension_until) >= new Date(matchDate)) {
            return {
                valid: false,
                error: `الحكم ${referee.full_name} موقوف حتى ${new Date(referee.suspension_until).toLocaleDateString('ar-EG')}`,
                type: 'suspension'
            };
        }

        // Check excuses
        const { data: excuses, error: excError } = await supabase
            .from('referee_excuses')
            .select('excuse_date, end_date, reason')
            .eq('referee_id', refereeId)
            .eq('status', 'accepted')
            .gte('end_date', matchDate)
            .lte('excuse_date', matchDate);

        if (excError) throw excError;

        if (excuses && excuses.length > 0) {
            return {
                valid: false,
                error: `الحكم ${referee.full_name} لديه عذر مقبول في هذا التاريخ`,
                type: 'excuse'
            };
        }

        // Check match conflicts
        let query = supabase
            .from('matches')
            .select('id, match_time, main_referee_id, fourth_referee_id, assistant1_referee_id, assistant2_referee_id')
            .eq('match_date', matchDate)
            .eq('match_time', matchTime);

        if (excludeMatchId) {
            query = query.neq('id', excludeMatchId);
        }

        const { data: conflicts, error: confError } = await query;

        if (confError) throw confError;

        if (conflicts && conflicts.length > 0) {
            const hasConflict = conflicts.some(match => 
                match.main_referee_id === refereeId ||
                match.fourth_referee_id === refereeId ||
                match.assistant1_referee_id === refereeId ||
                match.assistant2_referee_id === refereeId
            );

            if (hasConflict) {
                return {
                    valid: false,
                    error: `الحكم ${referee.full_name} لديه مباراة أخرى في نفس التوقيت`,
                    type: 'conflict'
                };
            }
        }

        return { valid: true };
    } catch (error) {
        console.error('Error validating referee availability:', error);
        throw error;
    }
};

export const validateMatchData = async (matchData) => {
    const errors = [];

    // ============================================
    // ✅ التحقق من عدم تكرار الحكام
    // ============================================
    const referees = [
        matchData.main_referee_id,
        matchData.fourth_referee_id,
        matchData.assistant1_referee_id,
        matchData.assistant2_referee_id
    ].filter(id => id && id !== '' && id !== null);

    const uniqueReferees = new Set(referees);
    if (referees.length !== uniqueReferees.size) {
        errors.push('لا يمكن تعيين نفس الحكم في أكثر من دور في نفس المباراة');
    }

    // التحقق من الفرق
    if (matchData.home_team_id === matchData.away_team_id) {
        errors.push('يجب أن يكون الفريق المضيف مختلفاً عن الفريق الضيف');
    }

    // التحقق من انتماء الفرق للمسابقة
    const { data: homeTeam, error: homeError } = await supabase
        .from('teams')
        .select('competition_id')
        .eq('id', matchData.home_team_id)
        .single();

    if (homeError) throw homeError;

    const { data: awayTeam, error: awayError } = await supabase
        .from('teams')
        .select('competition_id')
        .eq('id', matchData.away_team_id)
        .single();

    if (awayError) throw awayError;

    if (homeTeam.competition_id !== matchData.competition_id) {
        errors.push('الفريق المضيف لا ينتمي إلى هذه المسابقة');
    }

    if (awayTeam.competition_id !== matchData.competition_id) {
        errors.push('الفريق الضيف لا ينتمي إلى هذه المسابقة');
    }

    // التحقق من توفر الحكام
    const refereeFields = [
        { id: matchData.main_referee_id, label: 'الحكم الرئيسي' },
        { id: matchData.fourth_referee_id, label: 'الحكم الرابع' },
        { id: matchData.assistant1_referee_id, label: 'مساعد أول' },
        { id: matchData.assistant2_referee_id, label: 'مساعد ثاني' }
    ];

    for (const field of refereeFields) {
        if (field.id) {
            const result = await validateRefereeAvailability(
                field.id,
                matchData.match_date,
                matchData.match_time,
                matchData.id
            );
            if (!result.valid) {
                errors.push(`${field.label}: ${result.error}`);
            }
        }
    }

    return {
        valid: errors.length === 0,
        errors
    };
};

export const showValidationErrors = (errors) => {
    if (errors.length === 0) return;
    Swal.fire({
        icon: 'error',
        title: 'خطأ في التحقق',
        html: errors.map(err => `<div class="text-right">• ${err}</div>`).join(''),
        confirmButtonText: 'حسناً',
        confirmButtonColor: '#dc3545'
    });
};

export const validateAndSubmit = async (formData, submitFunction) => {
    try {
        const validation = await validateMatchData(formData);
        if (!validation.valid) {
            showValidationErrors(validation.errors);
            return false;
        }
        await submitFunction(formData);
        return true;
    } catch (error) {
        console.error('Validation/submission error:', error);
        Swal.fire({
            icon: 'error',
            title: 'حدث خطأ',
            text: error.message,
            confirmButtonText: 'حسناً'
        });
        return false;
    }
};

export default {
    validateRefereeAvailability,
    validateMatchData,
    showValidationErrors,
    validateAndSubmit
};

// validators.js - إضافة هذه الدالة في نهاية الملف

// ============================================
// التحقق من تعارض التوقيت (ساعتين على الأقل)
// ============================================
export const checkTimeConflict = async (refereeId, matchDate, matchTime, excludeMatchId = null) => {
    if (!refereeId) return { hasConflict: false };

    try {
        const matchDateTime = new Date(`${matchDate}T${matchTime}`);
        
        let query = supabase
            .from('matches')
            .select('id, match_date, match_time, main_referee_id, fourth_referee_id, assistant1_referee_id, assistant2_referee_id, var_referee_id, avar_referee_id')
            .eq('match_date', matchDate)
            .or(`main_referee_id.eq.${refereeId},fourth_referee_id.eq.${refereeId},assistant1_referee_id.eq.${refereeId},assistant2_referee_id.eq.${refereeId},var_referee_id.eq.${refereeId},avar_referee_id.eq.${refereeId}`);

        if (excludeMatchId) {
            query = query.neq('id', excludeMatchId);
        }

        const { data: conflicts, error } = await query;

        if (error) throw error;

        if (!conflicts || conflicts.length === 0) {
            return { hasConflict: false };
        }

        for (const conflict of conflicts) {
            const conflictDateTime = new Date(`${conflict.match_date}T${conflict.match_time}`);
            const diffMinutes = Math.abs((matchDateTime - conflictDateTime) / (1000 * 60));
            
            // ✅ يجب أن يكون الفرق ساعتين على الأقل (120 دقيقة)
            if (diffMinutes < 120) {
                return {
                    hasConflict: true,
                    conflictMatch: conflict,
                    diffMinutes: diffMinutes
                };
            }
        }

        return { hasConflict: false };
    } catch (error) {
        console.error('Error checking time conflict:', error);
        return { hasConflict: false };
    }
};