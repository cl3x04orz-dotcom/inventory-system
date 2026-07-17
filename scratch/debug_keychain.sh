#!/bin/bash

echo "=== 開始掃描 macOS Keychain 憑證 ==="

check_keychain() {
    local keychain_path="$1"
    local keychain_name="$2"
    echo "正在掃描 ${keychain_name} ($keychain_path)..."

    temp_dir=$(mktemp -d)
    
    security find-certificate -a "$keychain_path" > "${temp_dir}/all_certs.pem" 2>/dev/null
    
    awk '
        /---BEGIN CERTIFICATE---/ {filename=sprintf("%s/cert_%d.pem", temp_dir, ++i); temp_dir_var=1}
        temp_dir_var {print > filename}
        /---END CERTIFICATE---/ {temp_dir_var=0}
    ' temp_dir="$temp_dir" "${temp_dir}/all_certs.pem"

    local corrupted_count=0
    for cert_file in "${temp_dir}"/cert_*.pem; do
        if [ ! -f "$cert_file" ]; then continue; fi
        
        local is_corrupted=0
        local reason=""
        
        if ! openssl x509 -in "$cert_file" -noout 2>/dev/null; then
            is_corrupted=1
            reason="OpenSSL 無法解析此憑證格式"
        else
            # 檢查 RSA 密鑰長度 (Rustls 不支持小於 2048 位的 RSA 密鑰)
            local key_type=$(openssl x509 -in "$cert_file" -text -noout 2>/dev/null | grep -E "Public-Key:|RSA Public-Key:" | head -n 1)
            if echo "$key_type" | grep -q "RSA"; then
                local bits=$(openssl x509 -in "$cert_file" -text -noout 2>/dev/null | grep -E "Public-Key:|RSA Public-Key:" -A 1 | tail -n 1 | grep -oE "[0-9]+ bit" | cut -d' ' -f1)
                if [ -z "$bits" ]; then
                    bits=$(openssl x509 -in "$cert_file" -text -noout 2>/dev/null | grep -oE "[0-9]+ bit" | head -n 1 | cut -d' ' -f1)
                fi
                if [ -n "$bits" ] && [ "$bits" -lt 2048 ]; then
                    is_corrupted=1
                    reason="RSA 密鑰長度太短 ($bits bits)，低於 Rustls 最低要求 2048 bits"
                fi
            fi
            
            # 檢查是否使用過期的簽章算法 (例如 MD5 或 MD2)
            local sig_algo=$(openssl x509 -in "$cert_file" -text -noout 2>/dev/null | grep "Signature Algorithm" | head -n 1)
            if echo "$sig_algo" | grep -qi -E "md5|md2"; then
                is_corrupted=1
                reason="使用不安全的舊型簽章算法 ($sig_algo)"
            fi
        fi

        if [ "$is_corrupted" -eq 1 ]; then
            echo "--------------------------------------------------"
            echo "❌ 發現可疑的不相容憑證：$reason"
            
            local subject=$(openssl x509 -in "$cert_file" -subject -noout 2>/dev/null | sed 's/subject=//')
            echo "憑證主旨 (Subject): $subject"
            
            if openssl x509 -in "$cert_file" -noout 2>/dev/null; then
                local sha1_hash=$(openssl x509 -in "$cert_file" -fingerprint -noout 2>/dev/null | cut -d'=' -f2 | tr -d ':')
                echo "SHA1 雜湊指紋: $sha1_hash"
                echo "提示：可以在「鑰匙圈存取」中搜尋此名稱或 SHA1 值並將其刪除。"
            else
                echo "憑證 PEM 內容前幾行："
                head -n 3 "$cert_file"
            fi
            corrupted_count=$((corrupted_count + 1))
        fi
    done

    rm -rf "$temp_dir"
    echo "掃描 ${keychain_name} 完成。共發現 ${corrupted_count} 個可能導致 Rustls 崩潰的憑證。"
    echo ""
}

# 掃描 login.keychain
check_keychain "$HOME/Library/Keychains/login.keychain-db" "個人登入鑰匙圈"

# 掃描 System.keychain
check_keychain "/Library/Keychains/System.keychain" "系統鑰匙圈"

echo "=== 掃描結束 ==="
